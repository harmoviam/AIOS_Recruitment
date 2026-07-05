import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { platformAdminOnly } from '../middleware/tenant.js';
import { pool } from '../db.js';

const router = Router();
router.use(authMiddleware);
router.use(platformAdminOnly);

router.get('/', async (_req, res) => {
  const { rows: tenants } = await pool.query(
    "SELECT COUNT(*)::int AS c FROM tenants WHERE status = 'active'"
  );
  const { rows: users } = await pool.query(
    'SELECT COUNT(*)::int AS c FROM users WHERE tenant_id IS NOT NULL'
  );
  const { rows: candidates } = await pool.query('SELECT COUNT(*)::int AS c FROM candidates');
  res.json({
    activeTenants: tenants[0].c,
    totalUsers: users[0].c,
    totalCandidates: candidates[0].c,
  });
});

router.get('/tenants', async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT t.*,
      (SELECT COUNT(*)::int FROM users u WHERE u.tenant_id = t.id) AS users_count,
      (SELECT COUNT(*)::int FROM candidates c WHERE c.tenant_id = t.id) AS candidates_count
    FROM tenants t
    ORDER BY t.name
  `);
  res.json(
    rows.map((t) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      plan: t.plan,
      status: t.status,
      primaryColor: t.primary_color,
      logoInitials: t.logo_initials,
      usersCount: t.users_count,
      candidatesCount: t.candidates_count,
      createdAt: t.created_at,
      features: t.features,
    }))
  );
});

router.get('/tenants/:slug', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT t.*,
      (SELECT COUNT(*)::int FROM users u WHERE u.tenant_id = t.id) AS users_count,
      (SELECT COUNT(*)::int FROM candidates c WHERE c.tenant_id = t.id) AS candidates_count
     FROM tenants t WHERE t.slug = $1`,
    [req.params.slug]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Tenant not found' });
  const t = rows[0];
  res.json({
    id: t.id,
    slug: t.slug,
    name: t.name,
    plan: t.plan,
    status: t.status,
    primaryColor: t.primary_color,
    logoInitials: t.logo_initials,
    usersCount: t.users_count,
    candidatesCount: t.candidates_count,
    createdAt: t.created_at,
    features: t.features,
  });
});

export default router;
