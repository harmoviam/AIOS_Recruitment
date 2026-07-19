import { pool } from '../db.js';

const EARLIER_STAGES = ['applied', 'screening'];

/** Move candidate to interview stage when an interview is booked (only from earlier stages). */
export async function promoteToInterviewStage(candidateId: number, tenantId: number): Promise<void> {
  await pool.query(
    `UPDATE candidates
     SET stage = 'interview', updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND stage = ANY($3::text[])`,
    [candidateId, tenantId, EARLIER_STAGES]
  );
  await pool.query(
    `UPDATE applications a SET stage = 'interview', updated_at = NOW()
     FROM candidates c
     WHERE c.id = $1 AND c.tenant_id = $2
       AND a.candidate_id = c.id AND a.job_id = c.job_id AND a.stage = ANY($3::text[])`,
    [candidateId, tenantId, EARLIER_STAGES]
  );
}

/** Repair candidates who have active interviews but were never moved to the interview stage. */
export async function syncInterviewStages(): Promise<void> {
  await pool.query(
    `UPDATE candidates c
     SET stage = 'interview', updated_at = NOW()
     WHERE c.stage = ANY($1::text[])
       AND EXISTS (
         SELECT 1 FROM interviews i
         WHERE i.candidate_id = c.id
           AND i.status IN ('pending', 'confirmed')
       )`,
    [EARLIER_STAGES]
  );
}
