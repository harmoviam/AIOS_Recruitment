import { Router } from 'express';
import { pool } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { loadTenantBySlug, requireTenant, tenantMiddleware } from '../middleware/tenant.js';

const router = Router();

router.get('/workspaces', async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT slug, name, logo_initials, primary_color, status
     FROM tenants
     WHERE status IN ('active', 'trial')
     ORDER BY name`
  );
  res.json(
    rows.map((t) => ({
      slug: t.slug,
      name: t.name,
      logoInitials: t.logo_initials,
      primaryColor: t.primary_color,
      status: t.status,
    }))
  );
});

router.get('/current', authMiddleware, tenantMiddleware, requireTenant, async (req, res) => {
  const t = req.tenant!;
  res.json({
    id: t.id,
    slug: t.slug,
    name: t.name,
    plan: t.plan,
    status: t.status,
    primaryColor: t.primary_color,
    logoInitials: t.logo_initials,
    features: t.features,
  });
});

router.get('/by-slug/:slug', async (req, res) => {
  const tenant = await loadTenantBySlug(req.params.slug);
  if (!tenant) return res.status(404).json({ error: 'Workspace not found' });
  res.json({
    slug: tenant.slug,
    name: tenant.name,
    logoInitials: tenant.logo_initials,
    primaryColor: tenant.primary_color,
  });
});

export default router;
