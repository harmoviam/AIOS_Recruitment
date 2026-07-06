import { Router, type Request } from 'express';
import { pool } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireTenant, tenantClause, tenantMiddleware } from '../middleware/tenant.js';

const router = Router();
router.use(authMiddleware);
router.use(tenantMiddleware);
router.use(requireTenant);

const tid = (req: Request) => req.tenant!.id;

/** Match candidate list scoping — recruiters/HMs only see their own team's counts. */
function candidateScopeSql(req: Request, paramStart: number) {
  const role = req.user!.role;
  if (role === 'recruiter') {
    return {
      sql: ` AND c.recruiter_id = $${paramStart}`,
      params: [req.user!.id] as unknown[],
      nextIndex: paramStart + 1,
    };
  }
  if (role === 'hiring_manager') {
    return {
      sql: ` AND c.recruiter_id IN (
        SELECT r.id FROM users r WHERE r.tenant_id = $${paramStart} AND r.role = 'recruiter'
        AND (r.managed_by_id = $${paramStart + 1}
          OR r.company_id = (SELECT company_id FROM users WHERE id = $${paramStart + 1}))
      )`,
      params: [tid(req), req.user!.id] as unknown[],
      nextIndex: paramStart + 2,
    };
  }
  return { sql: '', params: [] as unknown[], nextIndex: paramStart };
}

router.get('/', async (req, res) => {
  const t = tenantClause(tid(req), 'j', 1);
  const scope = candidateScopeSql(req, t.nextIndex);
  const params = [t.param, ...scope.params];

  const { rows } = await pool.query(
    `SELECT j.*, u.name AS assigned_name,
      (SELECT COUNT(*)::int FROM candidates c
         WHERE c.job_id = j.id AND c.tenant_id = j.tenant_id${scope.sql}) AS pipeline_count,
      (SELECT ROUND(AVG(c.ai_score)::numeric, 1) FROM candidates c
         WHERE c.job_id = j.id AND c.tenant_id = j.tenant_id${scope.sql}) AS avg_ai_score
    FROM jobs j
    LEFT JOIN users u ON j.assigned_to = u.id AND u.tenant_id = j.tenant_id
    WHERE ${t.sql}
    ORDER BY j.created_at DESC`,
    params
  );

  const jobs = rows.map((j) => ({
    ...j,
    pipeline_count: Number(j.pipeline_count) || 0,
    match_percent: j.avg_ai_score ? Math.min(99, Math.round(Number(j.avg_ai_score) * 10)) : 0,
  }));
  res.json(jobs);
});

router.get('/:id', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT j.*, u.name AS assigned_name FROM jobs j
     LEFT JOIN users u ON j.assigned_to = u.id AND u.tenant_id = j.tenant_id
     WHERE j.id = $1 AND j.tenant_id = $2`,
    [req.params.id, tid(req)]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Job not found' });
  res.json(rows[0]);
});

router.post('/', async (req, res) => {
  const { title, client, location, status, assigned_to, open_positions, description } = req.body;
  if (!title || !client || !location) {
    return res.status(400).json({ error: 'Title, client, and location required' });
  }

  const { rows } = await pool.query(
    `INSERT INTO jobs (title, client, location, status, assigned_to, open_positions, description, tenant_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [
      title,
      client,
      location,
      status || 'active',
      assigned_to || req.user!.id,
      open_positions || 1,
      description || null,
      tid(req),
    ]
  );
  res.status(201).json(rows[0]);
});

router.patch('/:id', async (req, res) => {
  const fields = ['title', 'client', 'location', 'status', 'assigned_to', 'open_positions', 'description'] as const;
  const updates: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  for (const f of fields) {
    if (req.body[f] !== undefined) {
      updates.push(`${f} = $${i++}`);
      params.push(req.body[f]);
    }
  }
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

  const idParam = i;
  const tenantParam = i + 1;
  params.push(req.params.id, tid(req));

  const { rows } = await pool.query(
    `UPDATE jobs SET ${updates.join(', ')} WHERE id = $${idParam} AND tenant_id = $${tenantParam} RETURNING *`,
    params
  );
  if (!rows[0]) return res.status(404).json({ error: 'Job not found' });
  res.json(rows[0]);
});

router.delete('/:id', async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM jobs WHERE id = $1 AND tenant_id = $2', [
    req.params.id,
    tid(req),
  ]);
  if (!rowCount) return res.status(404).json({ error: 'Job not found' });
  res.status(204).send();
});

export default router;
