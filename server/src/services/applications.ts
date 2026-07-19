import { pool } from '../db.js';

/**
 * Applications: candidate <-> job many-to-many.
 *
 * Transition plan (expand -> switch reads -> contract):
 * candidates.job_id/stage remain the "primary application" that the pipeline
 * and follow-up engine read today. Every route that changes them calls
 * syncPrimaryApplication so the applications table stays authoritative for
 * multi-job submissions, and application-level updates for the primary job
 * write back to the candidate row via syncCandidateFromApplication.
 */

export interface ApplicationRow {
  id: number;
  tenant_id: number;
  candidate_id: number;
  job_id: number;
  stage: string;
  ai_score: number | null;
  screening: unknown;
  offer_status: string | null;
  expected_joining_at: string | null;
  joined_at: string | null;
  recruiter_id: number | null;
  source: string | null;
  created_at: string;
  updated_at: string;
}

/** Upsert the application row matching the candidate's legacy job_id state. */
export async function syncPrimaryApplication(
  tenantId: number,
  candidate: {
    id: number;
    job_id: number | null;
    stage: string;
    ai_score?: number | null;
    screening?: unknown;
    offer_status?: string | null;
    expected_joining_at?: string | null;
    joined_at?: string | null;
    recruiter_id?: number | null;
    source?: string | null;
  }
): Promise<void> {
  if (!candidate.job_id) return;
  try {
    await pool.query(
      `INSERT INTO applications (tenant_id, candidate_id, job_id, stage, ai_score, screening,
         offer_status, expected_joining_at, joined_at, recruiter_id, source)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11)
       ON CONFLICT (candidate_id, job_id) DO UPDATE SET
         stage = EXCLUDED.stage,
         ai_score = COALESCE(EXCLUDED.ai_score, applications.ai_score),
         screening = COALESCE(EXCLUDED.screening, applications.screening),
         offer_status = EXCLUDED.offer_status,
         expected_joining_at = EXCLUDED.expected_joining_at,
         joined_at = EXCLUDED.joined_at,
         recruiter_id = COALESCE(EXCLUDED.recruiter_id, applications.recruiter_id),
         updated_at = NOW()`,
      [
        tenantId,
        candidate.id,
        candidate.job_id,
        candidate.stage || 'applied',
        candidate.ai_score ?? null,
        candidate.screening != null ? JSON.stringify(candidate.screening) : null,
        candidate.offer_status ?? null,
        candidate.expected_joining_at ?? null,
        candidate.joined_at ?? null,
        candidate.recruiter_id ?? null,
        candidate.source ?? 'manual',
      ]
    );
  } catch (err) {
    console.warn('syncPrimaryApplication failed:', (err as Error).message);
  }
}

/**
 * When an application for the candidate's primary job changes, mirror the
 * per-job fields back onto the candidate row that legacy reads still use.
 */
export async function syncCandidateFromApplication(app: ApplicationRow): Promise<void> {
  await pool.query(
    `UPDATE candidates SET
       stage = $1,
       offer_status = $2,
       expected_joining_at = $3,
       joined_at = $4,
       updated_at = NOW()
     WHERE id = $5 AND tenant_id = $6 AND job_id = $7`,
    [
      app.stage,
      app.offer_status,
      app.expected_joining_at,
      app.joined_at,
      app.candidate_id,
      app.tenant_id,
      app.job_id,
    ]
  );
}

/** Create applications for extra jobs beyond the primary one (multi-job submit). */
export async function createAdditionalApplications(
  tenantId: number,
  candidateId: number,
  jobIds: number[],
  recruiterId: number | null,
  source: string
): Promise<void> {
  for (const jobId of jobIds) {
    await pool.query(
      `INSERT INTO applications (tenant_id, candidate_id, job_id, stage, recruiter_id, source)
       VALUES ($1, $2, $3, 'applied', $4, $5)
       ON CONFLICT (candidate_id, job_id) DO NOTHING`,
      [tenantId, candidateId, jobId, recruiterId, source]
    );
  }
}

/** Bulk mirror of candidates' legacy per-job state into applications (bulk stage updates, imports). */
export async function syncApplicationsForCandidates(
  tenantId: number,
  candidateIds: number[]
): Promise<void> {
  if (candidateIds.length === 0) return;
  try {
    await pool.query(
      `INSERT INTO applications (tenant_id, candidate_id, job_id, stage, ai_score, screening,
         offer_status, expected_joining_at, joined_at, recruiter_id, source)
       SELECT c.tenant_id, c.id, c.job_id, c.stage, c.ai_score, c.screening,
         c.offer_status, c.expected_joining_at, c.joined_at, c.recruiter_id, COALESCE(c.source, 'manual')
       FROM candidates c
       WHERE c.tenant_id = $1 AND c.id = ANY($2::int[]) AND c.job_id IS NOT NULL
       ON CONFLICT (candidate_id, job_id) DO UPDATE SET
         stage = EXCLUDED.stage,
         ai_score = COALESCE(EXCLUDED.ai_score, applications.ai_score),
         screening = COALESCE(EXCLUDED.screening, applications.screening),
         offer_status = EXCLUDED.offer_status,
         expected_joining_at = EXCLUDED.expected_joining_at,
         joined_at = EXCLUDED.joined_at,
         updated_at = NOW()`,
      [tenantId, candidateIds]
    );
  } catch (err) {
    console.warn('syncApplicationsForCandidates failed:', (err as Error).message);
  }
}

export async function listCandidateApplications(
  tenantId: number,
  candidateId: number
): Promise<Array<ApplicationRow & { job_title: string; job_client: string; job_location: string }>> {
  const { rows } = await pool.query(
    `SELECT a.*, j.title AS job_title, j.client AS job_client, j.location AS job_location
     FROM applications a
     JOIN jobs j ON j.id = a.job_id AND j.tenant_id = a.tenant_id
     WHERE a.tenant_id = $1 AND a.candidate_id = $2
     ORDER BY a.updated_at DESC`,
    [tenantId, candidateId]
  );
  return rows;
}
