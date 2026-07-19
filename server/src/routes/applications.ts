import { Router, type Request } from 'express';
import { pool } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import {
  assertCandidateInTenant,
  assertJobInTenant,
  requireTenant,
  tenantMiddleware,
} from '../middleware/tenant.js';
import {
  listCandidateApplications,
  syncCandidateFromApplication,
  type ApplicationRow,
} from '../services/applications.js';
import { rescoreCandidate } from '../services/ai.js';

const router = Router();
router.use(authMiddleware);
router.use(tenantMiddleware);
router.use(requireTenant);

const tid = (req: Request) => req.tenant!.id;

const STAGES = ['applied', 'screening', 'interview', 'selected', 'rejected', 'joined'];
const OFFER_STATUSES = [
  'accepted',
  'offer_rejected',
  'not_interested',
  'joined_elsewhere',
  'left_company',
];

async function fetchApplication(req: Request, id: number): Promise<ApplicationRow | null> {
  const { rows } = await pool.query('SELECT * FROM applications WHERE id = $1 AND tenant_id = $2', [
    id,
    tid(req),
  ]);
  return rows[0] || null;
}

/** Is this application the candidate's primary one (mirrored on the candidate row)? */
async function isPrimary(app: ApplicationRow): Promise<boolean> {
  const { rows } = await pool.query(
    'SELECT 1 FROM candidates WHERE id = $1 AND tenant_id = $2 AND job_id = $3',
    [app.candidate_id, app.tenant_id, app.job_id]
  );
  return rows.length > 0;
}

router.get('/candidate/:candidateId', async (req, res) => {
  const candidateId = Number(req.params.candidateId);
  if (!(await assertCandidateInTenant(candidateId, tid(req)))) {
    return res.status(404).json({ error: 'Candidate not found' });
  }
  res.json(await listCandidateApplications(tid(req), candidateId));
});

/** Submit an existing candidate to a job. */
router.post('/candidate/:candidateId', async (req, res) => {
  const candidateId = Number(req.params.candidateId);
  const jobId = Number(req.body?.job_id);
  if (!Number.isFinite(jobId)) return res.status(400).json({ error: 'job_id required' });
  if (!(await assertCandidateInTenant(candidateId, tid(req)))) {
    return res.status(404).json({ error: 'Candidate not found' });
  }
  if (!(await assertJobInTenant(jobId, tid(req)))) {
    return res.status(400).json({ error: 'Invalid job for this workspace' });
  }

  const { rows } = await pool.query(
    `INSERT INTO applications (tenant_id, candidate_id, job_id, stage, recruiter_id, source)
     VALUES ($1, $2, $3, 'applied', $4, 'manual')
     ON CONFLICT (candidate_id, job_id) DO NOTHING
     RETURNING *`,
    [tid(req), candidateId, jobId, req.user!.id]
  );
  if (!rows[0]) {
    return res.status(409).json({ error: 'Candidate is already submitted to this job' });
  }

  // First application becomes the candidate's primary job.
  const { rows: updated } = await pool.query(
    `UPDATE candidates SET job_id = $1, updated_at = NOW()
     WHERE id = $2 AND tenant_id = $3 AND job_id IS NULL RETURNING id`,
    [jobId, candidateId, tid(req)]
  );
  if (updated.length > 0) void rescoreCandidate(tid(req), candidateId);

  const { rows: cand } = await pool.query(
    'SELECT name FROM candidates WHERE id = $1 AND tenant_id = $2',
    [candidateId, tid(req)]
  );
  const { rows: job } = await pool.query(
    'SELECT title FROM jobs WHERE id = $1 AND tenant_id = $2',
    [jobId, tid(req)]
  );
  await pool.query(
    'INSERT INTO activities (type, description, user_id, candidate_id, tenant_id) VALUES ($1, $2, $3, $4, $5)',
    [
      'pipeline',
      `${cand[0]?.name || 'Candidate'} submitted to ${job[0]?.title || `job #${jobId}`}`,
      req.user!.id,
      candidateId,
      tid(req),
    ]
  );

  res.status(201).json(rows[0]);
});

router.patch('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const app = await fetchApplication(req, id);
  if (!app) return res.status(404).json({ error: 'Application not found' });

  const { stage, offer_status, expected_joining_at } = req.body;
  const updates: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  if (stage !== undefined) {
    if (!STAGES.includes(stage)) return res.status(400).json({ error: 'Invalid stage' });
    updates.push(`stage = $${i++}`);
    params.push(stage);
    if (stage === 'joined') {
      updates.push('joined_at = COALESCE(joined_at, NOW())');
      updates.push('offer_status = NULL');
    } else if (stage === 'selected' || stage === 'screening') {
      updates.push('offer_status = NULL');
    }
  }
  if (offer_status !== undefined) {
    if (offer_status !== null && !OFFER_STATUSES.includes(offer_status)) {
      return res.status(400).json({ error: 'Invalid offer_status' });
    }
    updates.push(`offer_status = $${i++}`);
    params.push(offer_status);
  }
  if (expected_joining_at !== undefined) {
    if (expected_joining_at !== null && Number.isNaN(Date.parse(expected_joining_at))) {
      return res.status(400).json({ error: 'Invalid expected_joining_at' });
    }
    updates.push(`expected_joining_at = $${i++}`);
    params.push(expected_joining_at);
  }
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

  updates.push('updated_at = NOW()');
  params.push(id, tid(req));
  const { rows } = await pool.query(
    `UPDATE applications SET ${updates.join(', ')} WHERE id = $${i} AND tenant_id = $${i + 1} RETURNING *`,
    params
  );

  // Primary application changes mirror onto the candidate row (legacy reads,
  // pipeline, and the follow-up engine still key off candidates.stage).
  if (await isPrimary(rows[0])) {
    await syncCandidateFromApplication(rows[0]);
  }

  if (stage) {
    const { rows: cand } = await pool.query(
      'SELECT name FROM candidates WHERE id = $1 AND tenant_id = $2',
      [app.candidate_id, tid(req)]
    );
    const { rows: job } = await pool.query(
      'SELECT title FROM jobs WHERE id = $1 AND tenant_id = $2',
      [app.job_id, tid(req)]
    );
    await pool.query(
      'INSERT INTO activities (type, description, user_id, candidate_id, tenant_id) VALUES ($1, $2, $3, $4, $5)',
      [
        'pipeline',
        `${cand[0]?.name || 'Candidate'} moved to ${stage} for ${job[0]?.title || `job #${app.job_id}`}`,
        req.user!.id,
        app.candidate_id,
        tid(req),
      ]
    );
  }

  res.json(rows[0]);
});

/** Withdraw an application. If it was primary, promote the newest remaining one. */
router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const app = await fetchApplication(req, id);
  if (!app) return res.status(404).json({ error: 'Application not found' });

  const wasPrimary = await isPrimary(app);
  await pool.query('DELETE FROM applications WHERE id = $1 AND tenant_id = $2', [id, tid(req)]);

  if (wasPrimary) {
    const { rows: remaining } = await pool.query(
      `SELECT * FROM applications WHERE candidate_id = $1 AND tenant_id = $2
       ORDER BY updated_at DESC LIMIT 1`,
      [app.candidate_id, tid(req)]
    );
    if (remaining[0]) {
      await pool.query(
        `UPDATE candidates SET job_id = $1, stage = $2, offer_status = $3,
           expected_joining_at = $4, joined_at = $5, updated_at = NOW()
         WHERE id = $6 AND tenant_id = $7`,
        [
          remaining[0].job_id,
          remaining[0].stage,
          remaining[0].offer_status,
          remaining[0].expected_joining_at,
          remaining[0].joined_at,
          app.candidate_id,
          tid(req),
        ]
      );
    } else {
      await pool.query(
        `UPDATE candidates SET job_id = NULL, updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
        [app.candidate_id, tid(req)]
      );
    }
  }

  res.json({ deleted: true });
});

export default router;
