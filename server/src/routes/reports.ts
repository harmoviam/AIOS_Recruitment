import { Router, type Request } from 'express';
import { pool } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireTenant, tenantMiddleware } from '../middleware/tenant.js';

const router = Router();
router.use(authMiddleware);
router.use(tenantMiddleware);
router.use(requireTenant);

const tid = (req: Request) => req.tenant!.id;

router.get('/', async (req, res) => {
  const { type = 'recruiter', days = '30' } = req.query;
  const tenantId = tid(req);
  const dayCount = Math.min(365, Math.max(1, Number(days) || 30));

  if (type === 'recruiter') {
    const { rows } = await pool.query(
      `SELECT u.name,
        COUNT(c.id) FILTER (WHERE c.stage = 'joined')::int AS placements,
        COUNT(c.id)::int AS total,
        COUNT(c.id) FILTER (WHERE c.stage IN ('interview', 'selected'))::int AS interviews
       FROM users u
       LEFT JOIN candidates c ON c.recruiter_id = u.id AND c.tenant_id = u.tenant_id
         AND c.updated_at >= NOW() - ($2 || ' days')::interval
       WHERE u.tenant_id = $1 AND u.role IN ('recruiter', 'admin')
       GROUP BY u.id, u.name ORDER BY placements DESC`,
      [tenantId, String(dayCount)]
    );
    return res.json({ type, data: rows });
  }

  if (type === 'funnel') {
    const { rows } = await pool.query(
      `SELECT stage, COUNT(*)::int AS count FROM candidates
       WHERE tenant_id = $1 AND updated_at >= NOW() - ($2 || ' days')::interval
       GROUP BY stage ORDER BY count DESC`,
      [tenantId, String(dayCount)]
    );
    return res.json({ type, data: rows });
  }

  if (type === 'offer') {
    const { rows } = await pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE stage = 'selected')::int AS offers,
        COUNT(*) FILTER (WHERE stage = 'joined')::int AS accepted,
        COUNT(*) FILTER (WHERE stage = 'rejected')::int AS rejected
       FROM candidates WHERE tenant_id = $1 AND updated_at >= NOW() - ($2 || ' days')::interval`,
      [tenantId, String(dayCount)]
    );
    const r = rows[0];
    const rate = r.offers > 0 ? Math.round((r.accepted / r.offers) * 100) : 0;
    return res.json({ type, data: { ...r, acceptance_rate: rate } });
  }

  res.status(400).json({ error: 'Invalid report type' });
});

router.get('/export', async (req, res) => {
  const { type = 'funnel', days = '30' } = req.query;
  const tenantId = tid(req);
  const dayCount = Math.min(365, Math.max(1, Number(days) || 30));

  let rows: Record<string, unknown>[] = [];
  if (type === 'recruiter') {
    const result = await pool.query(
      `SELECT u.name, COUNT(c.id) FILTER (WHERE c.stage = 'joined')::int AS placements,
        COUNT(c.id)::int AS total
       FROM users u LEFT JOIN candidates c ON c.recruiter_id = u.id AND c.tenant_id = u.tenant_id
       WHERE u.tenant_id = $1 AND u.role IN ('recruiter', 'admin')
       GROUP BY u.id, u.name`,
      [tenantId]
    );
    rows = result.rows;
  } else {
    const result = await pool.query(
      `SELECT stage, COUNT(*)::int AS count FROM candidates WHERE tenant_id = $1
       AND updated_at >= NOW() - ($2 || ' days')::interval GROUP BY stage`,
      [tenantId, String(dayCount)]
    );
    rows = result.rows;
  }

  const headers = Object.keys(rows[0] || { message: 'no data' });
  const csv = [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => JSON.stringify(r[h] ?? '')).join(',')),
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${type}-report.csv"`);
  res.send(csv);
});

export default router;
