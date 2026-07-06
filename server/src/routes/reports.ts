import { Router, type Request } from 'express';
import { pool } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireTenant, tenantMiddleware } from '../middleware/tenant.js';

const router = Router();
router.use(authMiddleware);
router.use(tenantMiddleware);
router.use(requireTenant);

const tid = (req: Request) => req.tenant!.id;

/**
 * Recruiters only see their own performance. Admins/hiring managers see the
 * whole organization. Returns the SQL fragment + params to scope candidate
 * queries, plus a flag indicating whether the caller is limited to self.
 */
function recruiterScope(req: Request, alias: string, startIdx: number) {
  if (req.user!.role === 'recruiter') {
    return {
      selfOnly: true,
      sql: ` AND ${alias}.recruiter_id = $${startIdx}`,
      params: [req.user!.id] as unknown[],
    };
  }
  return { selfOnly: false, sql: '', params: [] as unknown[] };
}

router.get('/', async (req, res) => {
  const { type = 'recruiter', days = '30' } = req.query;
  const tenantId = tid(req);
  const dayCount = Math.min(365, Math.max(1, Number(days) || 30));
  const scope = recruiterScope(req, 'c', 3);

  if (type === 'recruiter') {
    // Recruiters only see their own row; admins/HMs see all recruiters.
    const params: unknown[] = [tenantId, String(dayCount)];
    let userFilter = "u.role IN ('recruiter', 'admin')";
    if (scope.selfOnly) {
      userFilter = 'u.id = $3';
      params.push(req.user!.id);
    }
    const { rows } = await pool.query(
      `SELECT u.name,
        COUNT(c.id) FILTER (WHERE c.stage = 'joined')::int AS placements,
        COUNT(c.id)::int AS total,
        COUNT(c.id) FILTER (WHERE c.stage IN ('interview', 'selected'))::int AS interviews,
        COUNT(c.id) FILTER (WHERE c.stage = 'selected')::int AS selected
       FROM users u
       LEFT JOIN candidates c ON c.recruiter_id = u.id AND c.tenant_id = u.tenant_id
         AND c.updated_at >= NOW() - ($2 || ' days')::interval
       WHERE u.tenant_id = $1 AND ${userFilter}
       GROUP BY u.id, u.name ORDER BY placements DESC`,
      params
    );
    return res.json({ type, data: rows, scope: scope.selfOnly ? 'self' : 'org' });
  }

  if (type === 'funnel') {
    const { rows } = await pool.query(
      `SELECT c.stage, COUNT(*)::int AS count FROM candidates c
       WHERE c.tenant_id = $1 AND c.updated_at >= NOW() - ($2 || ' days')::interval${scope.sql}
       GROUP BY c.stage ORDER BY count DESC`,
      [tenantId, String(dayCount), ...scope.params]
    );
    return res.json({ type, data: rows, scope: scope.selfOnly ? 'self' : 'org' });
  }

  if (type === 'offer') {
    const { rows } = await pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE c.stage = 'selected')::int AS offers,
        COUNT(*) FILTER (WHERE c.stage = 'joined')::int AS accepted,
        COUNT(*) FILTER (WHERE c.stage = 'rejected')::int AS rejected
       FROM candidates c WHERE c.tenant_id = $1
       AND c.updated_at >= NOW() - ($2 || ' days')::interval${scope.sql}`,
      [tenantId, String(dayCount), ...scope.params]
    );
    const r = rows[0];
    const rate = r.offers > 0 ? Math.round((r.accepted / r.offers) * 100) : 0;
    return res.json({ type, data: { ...r, acceptance_rate: rate }, scope: scope.selfOnly ? 'self' : 'org' });
  }

  res.status(400).json({ error: 'Invalid report type' });
});

router.get('/export', async (req, res) => {
  const { type = 'funnel', days = '30' } = req.query;
  const tenantId = tid(req);
  const dayCount = Math.min(365, Math.max(1, Number(days) || 30));
  const scope = recruiterScope(req, 'c', 3);

  let rows: Record<string, unknown>[] = [];
  if (type === 'recruiter') {
    const params: unknown[] = [tenantId];
    let userFilter = "u.role IN ('recruiter', 'admin')";
    if (scope.selfOnly) {
      userFilter = 'u.id = $2';
      params.push(req.user!.id);
    }
    const result = await pool.query(
      `SELECT u.name, COUNT(c.id) FILTER (WHERE c.stage = 'joined')::int AS placements,
        COUNT(c.id)::int AS total
       FROM users u LEFT JOIN candidates c ON c.recruiter_id = u.id AND c.tenant_id = u.tenant_id
       WHERE u.tenant_id = $1 AND ${userFilter}
       GROUP BY u.id, u.name`,
      params
    );
    rows = result.rows;
  } else {
    const result = await pool.query(
      `SELECT c.stage, COUNT(*)::int AS count FROM candidates c WHERE c.tenant_id = $1
       AND c.updated_at >= NOW() - ($2 || ' days')::interval${scope.sql} GROUP BY c.stage`,
      [tenantId, String(dayCount), ...scope.params]
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
