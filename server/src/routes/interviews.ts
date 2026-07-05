import { Router, type Request } from 'express';
import { pool } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import {
  assertCandidateInTenant,
  requireTenant,
  tenantClause,
  tenantMiddleware,
} from '../middleware/tenant.js';

const router = Router();
router.use(authMiddleware);
router.use(tenantMiddleware);
router.use(requireTenant);

const tid = (req: Request) => req.tenant!.id;

router.get('/', async (req, res) => {
  const { date, candidate_id } = req.query;
  const t = tenantClause(tid(req), 'c', 1);
  let sql = `
    SELECT i.*, c.name AS candidate_name, c.email AS candidate_email
    FROM interviews i
    JOIN candidates c ON i.candidate_id = c.id
    WHERE ${t.sql}
  `;
  const params: unknown[] = [t.param];
  let idx = t.nextIndex;

  if (candidate_id) {
    sql += ` AND i.candidate_id = $${idx++}`;
    params.push(Number(candidate_id));
  }
  if (date) {
    sql += ` AND i.scheduled_at::date = $${idx++}::date`;
    params.push(date);
  }
  sql += ' ORDER BY i.scheduled_at ASC';

  const { rows } = await pool.query(sql, params);
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { candidate_id, scheduled_at, duration_minutes, round_type, status, meeting_link, notes } =
    req.body;
  if (!candidate_id || !scheduled_at) {
    return res.status(400).json({ error: 'candidate_id and scheduled_at required' });
  }

  if (!(await assertCandidateInTenant(Number(candidate_id), tid(req)))) {
    return res.status(404).json({ error: 'Candidate not found' });
  }

  const { rows } = await pool.query(
    `INSERT INTO interviews (candidate_id, scheduled_at, duration_minutes, round_type, status, meeting_link, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      candidate_id,
      scheduled_at,
      duration_minutes || 60,
      round_type || 'Technical',
      status || 'pending',
      meeting_link || null,
      notes || null,
    ]
  );

  await pool.query(
    'INSERT INTO activities (type, description, user_id, candidate_id, tenant_id) VALUES ($1, $2, $3, $4, $5)',
    ['interview', `Interview scheduled for candidate #${candidate_id}`, req.user!.id, candidate_id, tid(req)]
  );

  res.status(201).json(rows[0]);
});

router.patch('/:id', async (req, res) => {
  const fields = ['scheduled_at', 'duration_minutes', 'round_type', 'status', 'meeting_link', 'notes', 'score'] as const;
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
    `UPDATE interviews i SET ${updates.join(', ')}
     FROM candidates c
     WHERE i.id = $${idParam} AND i.candidate_id = c.id AND c.tenant_id = $${tenantParam}
     RETURNING i.*`,
    params
  );
  if (!rows[0]) return res.status(404).json({ error: 'Interview not found' });
  res.json(rows[0]);
});

router.delete('/:id', async (req, res) => {
  const { rowCount } = await pool.query(
    `DELETE FROM interviews i USING candidates c
     WHERE i.id = $1 AND i.candidate_id = c.id AND c.tenant_id = $2`,
    [req.params.id, tid(req)]
  );
  if (!rowCount) return res.status(404).json({ error: 'Interview not found' });
  res.status(204).send();
});

export default router;
