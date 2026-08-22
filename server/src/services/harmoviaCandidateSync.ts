import { pool } from '../db.js';

const DEFAULT_BATCH_LIMIT = 25;
const DEFAULT_POLL_MS = 15_000;
const HARMOVIA_TENANT_SLUG = 'harmovia';

export interface HarmoviaCandidatePayload {
  event_id: string;
  tenant_id: number;
  tenant_slug: string;
  candidate: {
    id: number;
    name: string;
    email: string | null;
    phone: string | null;
    current_location: string | null;
    highest_qualification: string | null;
  };
  job: { id: number; name: string } | null;
}

interface CandidateSyncRow {
  outbox_id: string | number;
  tenant_id: number;
  tenant_slug: string;
  candidate_id: number;
  candidate_name: string;
  email: string | null;
  phone: string | null;
  current_location: string | null;
  highest_qualification: string | null;
  job_id: number | null;
  job_name: string | null;
  attempts: number;
}

function config() {
  return {
    baseUrl: (process.env.HARMOVIA_CRM_URL || '').replace(/\/$/, ''),
    secret: process.env.HARMOVIA_INTEGRATION_SECRET || '',
    tenantSlug: HARMOVIA_TENANT_SLUG,
    pollMs: Math.max(1_000, Number(process.env.HARMOVIA_SYNC_POLL_MS) || DEFAULT_POLL_MS),
  };
}

export function harmoviaSyncEnabled(): boolean {
  const c = config();
  return Boolean(c.baseUrl && c.secret && c.tenantSlug);
}

export function retryDelayMs(attempts: number): number {
  return Math.min(15 * 60_000, 5_000 * 2 ** Math.max(0, attempts - 1));
}

export function buildHarmoviaCandidatePayload(row: CandidateSyncRow): HarmoviaCandidatePayload {
  return {
    event_id: `candidate-${row.tenant_id}-${row.candidate_id}-${row.outbox_id}`,
    tenant_id: row.tenant_id,
    tenant_slug: row.tenant_slug,
    candidate: {
      id: row.candidate_id,
      name: row.candidate_name,
      email: row.email || null,
      phone: row.phone || null,
      current_location: row.current_location || null,
      highest_qualification: row.highest_qualification || null,
    },
    job: row.job_id && row.job_name ? { id: row.job_id, name: row.job_name } : null,
  };
}

async function claimNext(): Promise<CandidateSyncRow | null> {
  const c = config();
  const claimed = await pool.query(
    `UPDATE harmovia_candidate_sync_outbox o
     SET status = 'processing', attempts = attempts + 1, updated_at = NOW()
     WHERE o.id = (
       SELECT pending.id
       FROM harmovia_candidate_sync_outbox pending
       JOIN tenants t ON t.id = pending.tenant_id
       WHERE pending.status IN ('pending', 'failed')
         AND pending.next_attempt_at <= NOW()
         AND LOWER(t.slug) = $1
       ORDER BY pending.next_attempt_at ASC, pending.id ASC
       FOR UPDATE OF pending SKIP LOCKED
       LIMIT 1
     )
     RETURNING o.id, o.tenant_id, o.candidate_id, o.attempts`,
    [c.tenantSlug],
  );
  if (!claimed.rows[0]) return null;

  const row = claimed.rows[0];
  const details = await pool.query(
    `SELECT
       $1::bigint AS outbox_id,
       c.tenant_id,
       t.slug AS tenant_slug,
       c.id AS candidate_id,
       c.name AS candidate_name,
       c.email,
       c.phone,
       c.current_location,
       c.highest_qualification,
       j.id AS job_id,
       j.title AS job_name,
       $2::int AS attempts
     FROM candidates c
     JOIN tenants t ON t.id = c.tenant_id
     LEFT JOIN jobs j ON j.id = c.job_id AND j.tenant_id = c.tenant_id
     WHERE c.id = $3 AND c.tenant_id = $4`,
    [row.id, row.attempts, row.candidate_id, row.tenant_id],
  );
  return details.rows[0] || null;
}

async function markDelivered(outboxId: string | number): Promise<void> {
  await pool.query(
    `UPDATE harmovia_candidate_sync_outbox
     SET status = 'delivered', delivered_at = NOW(), last_error = NULL, updated_at = NOW()
     WHERE id = $1`,
    [outboxId],
  );
}

async function markFailed(row: CandidateSyncRow, error: string): Promise<void> {
  const nextAttempt = new Date(Date.now() + retryDelayMs(row.attempts));
  await pool.query(
    `UPDATE harmovia_candidate_sync_outbox
     SET status = 'failed', next_attempt_at = $1, last_error = $2, updated_at = NOW()
     WHERE id = $3`,
    [nextAttempt, error.slice(0, 1000), row.outbox_id],
  );
}

async function deliver(row: CandidateSyncRow): Promise<void> {
  const c = config();
  const response = await fetch(`${c.baseUrl}/api/integrations/aios/candidates`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-aios-integration-secret': c.secret,
    },
    body: JSON.stringify(buildHarmoviaCandidatePayload(row)),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Harmovia CRM ${response.status}: ${text.slice(0, 500)}`);
  }
}

export async function processHarmoviaSyncOutbox(limit = DEFAULT_BATCH_LIMIT): Promise<number> {
  if (!harmoviaSyncEnabled()) return 0;
  await pool.query(
    `UPDATE harmovia_candidate_sync_outbox
     SET status = 'failed', next_attempt_at = NOW(),
         last_error = COALESCE(last_error, 'Recovered after interrupted delivery'), updated_at = NOW()
     WHERE status = 'processing' AND updated_at < NOW() - INTERVAL '5 minutes'`,
  );
  let delivered = 0;
  for (let index = 0; index < limit; index += 1) {
    const row = await claimNext();
    if (!row) break;
    try {
      await deliver(row);
      await markDelivered(row.outbox_id);
      delivered += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await markFailed(row, message);
      console.warn(`Harmovia candidate sync failed for candidate ${row.candidate_id}: ${message}`);
    }
  }
  return delivered;
}

export function startHarmoviaCandidateSyncWorker(): NodeJS.Timeout | null {
  if (!harmoviaSyncEnabled()) {
    console.log('Harmovia candidate sync disabled (set HARMOVIA_CRM_URL and HARMOVIA_INTEGRATION_SECRET)');
    return null;
  }

  const run = () => {
    void processHarmoviaSyncOutbox().catch((error) => {
      console.warn('Harmovia candidate sync poll failed:', (error as Error).message);
    });
  };
  run();
  const timer = setInterval(run, config().pollMs);
  timer.unref();
  return timer;
}
