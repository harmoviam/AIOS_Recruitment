import { pool } from '../../db.js';
import { linkedInConfig, linkedInJobPostingConfigured } from './auth.js';
import { submitSimpleJobPostings } from './jobPostingClient.js';
import {
  externalJobPostingId,
  publicCareersApplyUrl,
  toLinkedInJobElement,
  type JobRowForLinkedIn,
  type LinkedInJobOperation,
} from './jobPostingMapper.js';

export type LinkedInPostingStatus = 'pending' | 'live' | 'closed' | 'error' | 'not_posted';

export interface LinkedInPostingState {
  provider: 'LINKEDIN';
  status: LinkedInPostingStatus;
  externalJobPostingId: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  configured: boolean;
}

export class LinkedInJobPostingError extends Error {
  constructor(
    message: string,
    public status: number = 400
  ) {
    super(message);
    this.name = 'LinkedInJobPostingError';
  }
}

function appBaseUrl(): string {
  return (
    process.env.PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.CLIENT_URL ||
    'http://localhost:5174'
  ).replace(/\/$/, '');
}

async function resolveCompanyUrn(tenantId: number): Promise<string> {
  const { rows } = await pool.query(
    `SELECT value FROM settings WHERE tenant_id = $1 AND key = 'linkedin_company_urn' LIMIT 1`,
    [tenantId]
  );
  const raw = rows[0]?.value;
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (typeof obj.urn === 'string' && obj.urn.trim()) return obj.urn.trim();
    if (typeof obj.value === 'string' && obj.value.trim()) return obj.value.trim();
  }
  // JSONB string values sometimes come back already unquoted via pg.
  if (typeof raw === 'string') return raw;
  return linkedInConfig().companyUrn;
}

async function loadJob(tenantId: number, jobId: number): Promise<JobRowForLinkedIn> {
  const { rows } = await pool.query(
    `SELECT id, tenant_id, title, description, location, city, state, country, job_type, shift
       FROM jobs WHERE id = $1 AND tenant_id = $2`,
    [jobId, tenantId]
  );
  if (!rows[0]) throw new LinkedInJobPostingError('Job not found', 404);
  return rows[0] as JobRowForLinkedIn;
}

export async function getLinkedInPostingStatus(
  tenantId: number,
  jobId: number
): Promise<LinkedInPostingState> {
  const externalId = externalJobPostingId(tenantId, jobId);
  const { rows } = await pool.query(
    `SELECT external_job_posting_id, status, last_synced_at, last_error
       FROM job_external_postings
      WHERE tenant_id = $1 AND job_id = $2 AND provider = 'LINKEDIN'`,
    [tenantId, jobId]
  );
  if (!rows[0]) {
    return {
      provider: 'LINKEDIN',
      status: 'not_posted',
      externalJobPostingId: externalId,
      lastSyncedAt: null,
      lastError: null,
      configured: linkedInJobPostingConfigured(),
    };
  }
  return {
    provider: 'LINKEDIN',
    status: rows[0].status as LinkedInPostingStatus,
    externalJobPostingId: rows[0].external_job_posting_id,
    lastSyncedAt: rows[0].last_synced_at ? new Date(rows[0].last_synced_at).toISOString() : null,
    lastError: rows[0].last_error,
    configured: linkedInJobPostingConfigured(),
  };
}

async function upsertPostingState(input: {
  tenantId: number;
  jobId: number;
  externalId: string;
  status: Exclude<LinkedInPostingStatus, 'not_posted'>;
  error?: string | null;
  raw?: unknown;
}): Promise<LinkedInPostingState> {
  const { rows } = await pool.query(
    `INSERT INTO job_external_postings (
       tenant_id, job_id, provider, external_job_posting_id, status,
       last_synced_at, last_error, raw_response, updated_at
     ) VALUES ($1,$2,'LINKEDIN',$3,$4,NOW(),$5,$6::jsonb,NOW())
     ON CONFLICT (tenant_id, job_id, provider) DO UPDATE SET
       external_job_posting_id = EXCLUDED.external_job_posting_id,
       status = EXCLUDED.status,
       last_synced_at = EXCLUDED.last_synced_at,
       last_error = EXCLUDED.last_error,
       raw_response = EXCLUDED.raw_response,
       updated_at = NOW()
     RETURNING external_job_posting_id, status, last_synced_at, last_error`,
    [
      input.tenantId,
      input.jobId,
      input.externalId,
      input.status,
      input.error ?? null,
      JSON.stringify(input.raw ?? null),
    ]
  );
  return {
    provider: 'LINKEDIN',
    status: rows[0].status,
    externalJobPostingId: rows[0].external_job_posting_id,
    lastSyncedAt: rows[0].last_synced_at ? new Date(rows[0].last_synced_at).toISOString() : null,
    lastError: rows[0].last_error,
    configured: linkedInJobPostingConfigured(),
  };
}

function resolvePosterEmail(userEmail?: string | null): string {
  const fromUser = (userEmail || '').trim();
  if (fromUser.includes('@')) return fromUser;
  const fromEnv = (process.env.LINKEDIN_POSTER_EMAIL || '').trim();
  if (fromEnv.includes('@')) return fromEnv;
  return '';
}

async function runOperation(input: {
  tenantId: number;
  tenantSlug: string;
  jobId: number;
  operation: LinkedInJobOperation;
  posterEmail?: string | null;
}): Promise<LinkedInPostingState> {
  if (!linkedInJobPostingConfigured()) {
    throw new LinkedInJobPostingError(
      'LinkedIn job posting is not configured. Set LINKEDIN_JOB_POSTING_ENABLED=true with client credentials and LINKEDIN_COMPANY_URN (Talent SJP must be enabled by LinkedIn BD).',
      503
    );
  }

  const job = await loadJob(input.tenantId, input.jobId);
  if (!(job.title || '').trim()) {
    throw new LinkedInJobPostingError('Job title is required to post on LinkedIn');
  }

  const posterEmail = resolvePosterEmail(input.posterEmail);
  if (!posterEmail) {
    throw new LinkedInJobPostingError(
      'posterEmail is required. Sign in with an email account or set LINKEDIN_POSTER_EMAIL.'
    );
  }

  const companyUrn = await resolveCompanyUrn(input.tenantId);
  if (!companyUrn) {
    throw new LinkedInJobPostingError(
      'LinkedIn company URN is required (LINKEDIN_COMPANY_URN or settings.linkedin_company_urn)'
    );
  }

  const existing = await getLinkedInPostingStatus(input.tenantId, input.jobId);
  if (input.operation === 'CREATE' && existing.status === 'live') {
    throw new LinkedInJobPostingError('Job is already live on LinkedIn — use sync to update', 409);
  }
  if (
    (input.operation === 'UPDATE' || input.operation === 'CLOSE') &&
    existing.status !== 'live' &&
    existing.status !== 'error'
  ) {
    // Allow UPDATE/CLOSE after a prior CREATE attempt that errored if we have a row,
    // but require at least a prior post attempt for close/update of never-posted jobs.
    if (existing.status === 'not_posted') {
      throw new LinkedInJobPostingError('Job has not been posted to LinkedIn yet — publish first', 409);
    }
  }

  const element = toLinkedInJobElement({
    job,
    operation: input.operation,
    companyUrn,
    companyApplyUrl: publicCareersApplyUrl({
      appBaseUrl: appBaseUrl(),
      tenantSlug: input.tenantSlug,
      jobId: input.jobId,
    }),
    posterEmail,
  });

  const result = await submitSimpleJobPostings([element]);
  const externalId = element.externalJobPostingId;

  if (!result.ok) {
    return upsertPostingState({
      tenantId: input.tenantId,
      jobId: input.jobId,
      externalId,
      status: 'error',
      error: result.error || 'LinkedIn API error',
      raw: result.body,
    });
  }

  const status: Exclude<LinkedInPostingStatus, 'not_posted'> =
    input.operation === 'CLOSE' ? 'closed' : 'live';

  return upsertPostingState({
    tenantId: input.tenantId,
    jobId: input.jobId,
    externalId,
    status,
    error: null,
    raw: result.body,
  });
}

export async function publishJobToLinkedIn(input: {
  tenantId: number;
  tenantSlug: string;
  jobId: number;
  posterEmail?: string | null;
}): Promise<LinkedInPostingState> {
  return runOperation({ ...input, operation: 'CREATE' });
}

export async function syncJobOnLinkedIn(input: {
  tenantId: number;
  tenantSlug: string;
  jobId: number;
  posterEmail?: string | null;
}): Promise<LinkedInPostingState> {
  return runOperation({ ...input, operation: 'UPDATE' });
}

export async function closeJobOnLinkedIn(input: {
  tenantId: number;
  tenantSlug: string;
  jobId: number;
  posterEmail?: string | null;
}): Promise<LinkedInPostingState> {
  return runOperation({ ...input, operation: 'CLOSE' });
}

export async function getLinkedInCapabilities(): Promise<{
  configured: boolean;
  enabled: boolean;
  hasCredentials: boolean;
  hasCompanyUrn: boolean;
}> {
  const c = linkedInConfig();
  return {
    configured: linkedInJobPostingConfigured(),
    enabled: c.enabled,
    hasCredentials: Boolean(c.clientId && c.clientSecret),
    hasCompanyUrn: Boolean(c.companyUrn),
  };
}
