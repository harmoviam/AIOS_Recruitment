import { Router, type Request } from 'express';
import { pool } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireTenant, tenantMiddleware } from '../middleware/tenant.js';

const router = Router();
router.use(authMiddleware);
router.use(tenantMiddleware);
router.use(requireTenant);

const tid = (req: Request) => req.tenant!.id;

function adminOnly(req: Request, res: import('express').Response, next: import('express').NextFunction) {
  if (req.user!.role !== 'admin') {
    return res.status(403).json({ error: 'Organization Admin access required' });
  }
  next();
}

router.use(adminOnly);

router.get('/overview', async (req, res) => {
  const tenantId = tid(req);

  const [kpis, hiringManagers, recruiters, funnel] = await Promise.all([
    pool.query(
      `SELECT
        (SELECT COUNT(*)::int FROM users WHERE tenant_id = $1 AND role = 'hiring_manager') AS hiring_managers,
        (SELECT COUNT(*)::int FROM users WHERE tenant_id = $1 AND role = 'recruiter') AS recruiters,
        (SELECT COUNT(*)::int FROM candidates WHERE tenant_id = $1) AS candidates,
        (SELECT COUNT(*)::int FROM jobs WHERE tenant_id = $1 AND status = 'active') AS active_jobs,
        (SELECT COUNT(*)::int FROM candidates WHERE tenant_id = $1 AND stage = 'selected') AS selected,
        (SELECT COUNT(*)::int FROM candidates WHERE tenant_id = $1 AND stage = 'joined') AS joined,
        (SELECT COUNT(*)::int FROM candidates WHERE tenant_id = $1 AND stage = 'joined'
          AND updated_at >= DATE_TRUNC('month', NOW())) AS joinings_mtd`,
      [tenantId]
    ),
    pool.query(
      `SELECT u.id, u.name, u.email, co.name AS company,
        (SELECT COUNT(*)::int FROM users r WHERE r.tenant_id = u.tenant_id AND r.role = 'recruiter'
          AND (r.managed_by_id = u.id OR
            (r.managed_by_id IS NULL AND r.company_id = u.company_id AND u.company_id IS NOT NULL))) AS recruiter_count,
        (SELECT COUNT(*)::int FROM candidates c
          JOIN users r ON r.id = c.recruiter_id
          WHERE c.tenant_id = u.tenant_id
            AND (r.managed_by_id = u.id OR (r.managed_by_id IS NULL AND r.company_id = u.company_id))
          AND c.stage = 'joined' AND c.updated_at >= DATE_TRUNC('month', NOW())) AS team_joinings_mtd,
        (SELECT COUNT(*)::int FROM candidates c
          JOIN users r ON r.id = c.recruiter_id
          WHERE c.tenant_id = u.tenant_id
            AND (r.managed_by_id = u.id OR (r.managed_by_id IS NULL AND r.company_id = u.company_id))) AS team_candidates
       FROM users u
       LEFT JOIN companies co ON co.id = u.company_id
       WHERE u.tenant_id = $1 AND u.role = 'hiring_manager'
       ORDER BY team_joinings_mtd DESC`,
      [tenantId]
    ),
    pool.query(
      `SELECT u.id, u.name, u.email, co.name AS company, hm.name AS hiring_manager,
        (SELECT COUNT(*)::int FROM candidates c WHERE c.recruiter_id = u.id AND c.tenant_id = u.tenant_id) AS candidates,
        (SELECT COUNT(*)::int FROM candidates c WHERE c.recruiter_id = u.id AND c.tenant_id = u.tenant_id
          AND c.stage = 'joined' AND c.updated_at >= DATE_TRUNC('month', NOW())) AS joinings_mtd,
        (SELECT COUNT(*)::int FROM jobs j WHERE j.assigned_to = u.id AND j.tenant_id = u.tenant_id AND j.status = 'active') AS active_jobs
       FROM users u
       LEFT JOIN companies co ON co.id = u.company_id
       LEFT JOIN users hm ON hm.id = u.managed_by_id
       WHERE u.tenant_id = $1 AND u.role = 'recruiter'
       ORDER BY joinings_mtd DESC, candidates DESC`,
      [tenantId]
    ),
    pool.query(
      `SELECT stage, COUNT(*)::int AS count FROM candidates WHERE tenant_id = $1 GROUP BY stage ORDER BY count DESC`,
      [tenantId]
    ),
  ]);

  res.json({
    kpis: kpis.rows[0],
    hiringManagers: hiringManagers.rows.map((h) => ({
      id: h.id,
      name: h.name,
      email: h.email,
      company: h.company || '—',
      recruiterCount: h.recruiter_count,
      teamJoiningsMtd: h.team_joinings_mtd,
      teamCandidates: h.team_candidates,
    })),
    recruiters: recruiters.rows.map((r, idx) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      company: r.company || '—',
      hiringManager: r.hiring_manager || '—',
      candidates: r.candidates,
      joiningsMtd: r.joinings_mtd,
      activeJobs: r.active_jobs,
      rank: idx + 1,
    })),
    funnel: funnel.rows,
  });
});

export default router;
