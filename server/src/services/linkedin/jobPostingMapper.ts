/**
 * Map HarmiRecruit jobs → LinkedIn Simple Job Postings elements.
 * Fields aligned with LinkedIn foundation schema (API version 202603).
 */

export type LinkedInJobOperation = 'CREATE' | 'UPDATE' | 'RENEW' | 'CLOSE';

export type LinkedInEmploymentStatus =
  | 'FULL_TIME'
  | 'PART_TIME'
  | 'CONTRACT'
  | 'TEMPORARY'
  | 'INTERNSHIP'
  | 'VOLUNTEER'
  | 'OTHER';

export interface JobRowForLinkedIn {
  id: number;
  tenant_id: number;
  title: string;
  description?: string | null;
  location?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  job_type?: string | null;
  shift?: string | null;
}

export interface LinkedInJobPostingElement {
  jobPostingOperationType: LinkedInJobOperation;
  externalJobPostingId: string;
  listingType: 'BASIC';
  availability: 'PUBLIC';
  title: string;
  description: string;
  location: string;
  company: string;
  companyApplyUrl: string;
  employmentStatus: LinkedInEmploymentStatus;
  listedAt: number;
  posterEmail: string;
  workplaceTypes?: Array<'remote' | 'hybrid' | 'on-site'>;
}

/** LinkedIn description must be at least 100 characters (foundation schema). */
export const LINKEDIN_DESCRIPTION_MIN_CHARS = 100;

export function externalJobPostingId(tenantId: number, jobId: number): string {
  return `harmi-${tenantId}-${jobId}`;
}

export function mapEmploymentStatus(jobType: string | null | undefined): LinkedInEmploymentStatus {
  const raw = (jobType || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!raw) return 'FULL_TIME';
  if (raw.includes('part')) return 'PART_TIME';
  if (raw.includes('contract') || raw.includes('freelance') || raw.includes('consultant')) return 'CONTRACT';
  if (raw.includes('temp') || raw.includes('temporary')) return 'TEMPORARY';
  if (raw.includes('intern')) return 'INTERNSHIP';
  if (raw.includes('volunteer')) return 'VOLUNTEER';
  if (raw.includes('full')) return 'FULL_TIME';
  return 'FULL_TIME';
}

export function mapWorkplaceTypes(
  jobType: string | null | undefined,
  shift: string | null | undefined
): Array<'remote' | 'hybrid' | 'on-site'> | undefined {
  const blob = `${jobType || ''} ${shift || ''}`.toLowerCase();
  if (/\bremote\b|wfh|work from home/.test(blob)) return ['remote'];
  if (/\bhybrid\b/.test(blob)) return ['hybrid'];
  // Omit for on-site (LinkedIn default).
  return undefined;
}

export function buildLocation(job: JobRowForLinkedIn): string {
  const parts = [job.city, job.state, job.country].map((p) => (p || '').trim()).filter(Boolean);
  if (parts.length) return parts.join(', ');
  return (job.location || '').trim() || 'India';
}

export function publicCareersApplyUrl(opts: {
  appBaseUrl: string;
  tenantSlug: string;
  jobId: number;
}): string {
  const base = opts.appBaseUrl.replace(/\/$/, '');
  return `${base}/careers/${encodeURIComponent(opts.tenantSlug)}/jobs/${opts.jobId}`;
}

/** Ensure description meets LinkedIn's 100-character minimum without inventing fake JD content. */
export function ensureLinkedInDescription(job: JobRowForLinkedIn): string {
  const title = (job.title || '').trim() || 'Open role';
  const location = buildLocation(job);
  let description = (job.description || '').trim();
  if (!description) {
    description = `${title}\n\nLocation: ${location}.\nApply via the company careers page for full details and next steps.`;
  }
  if (description.length >= LINKEDIN_DESCRIPTION_MIN_CHARS) return description;

  const pad = `\n\nRole: ${title}\nLocation: ${location}\nApply via the HarmiRecruit careers listing for requirements, screening, and interview next steps.`;
  description = `${description}${pad}`.trim();
  if (description.length >= LINKEDIN_DESCRIPTION_MIN_CHARS) return description;

  // Last resort: pad with spaces is invalid; repeat a short neutral clause.
  while (description.length < LINKEDIN_DESCRIPTION_MIN_CHARS) {
    description += ' Please review the full role details on the careers apply page.';
  }
  return description;
}

export function toLinkedInJobElement(input: {
  job: JobRowForLinkedIn;
  operation: LinkedInJobOperation;
  companyUrn: string;
  companyApplyUrl: string;
  posterEmail: string;
  /** Epoch milliseconds (UTC). Schema requires ms, not seconds. */
  listedAtMs?: number;
}): LinkedInJobPostingElement {
  const { job, operation, companyUrn, companyApplyUrl } = input;
  const posterEmail = (input.posterEmail || '').trim();
  if (!posterEmail || !posterEmail.includes('@')) {
    throw new Error('posterEmail is required for LinkedIn job postings');
  }

  const title = (job.title || '').trim();
  const element: LinkedInJobPostingElement = {
    jobPostingOperationType: operation,
    externalJobPostingId: externalJobPostingId(job.tenant_id, job.id),
    listingType: 'BASIC',
    availability: 'PUBLIC',
    title,
    description: ensureLinkedInDescription(job),
    location: buildLocation(job),
    company: companyUrn,
    companyApplyUrl,
    employmentStatus: mapEmploymentStatus(job.job_type),
    listedAt: input.listedAtMs ?? Date.now(),
    posterEmail,
  };
  const workplace = mapWorkplaceTypes(job.job_type, job.shift);
  if (workplace) element.workplaceTypes = workplace;
  return element;
}
