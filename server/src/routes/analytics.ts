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
  const tenantId = tid(req);

  const [
    totalCandidates,
    interviewsToday,
    pendingFollowups,
    hotCandidates,
    stageCounts,
    recruiterPerf,
    monthlyPlacements,
    sourceConversion,
    activeJobs,
    newCandidates,
    placementsMtd,
  ] = await Promise.all([
    pool.query('SELECT COUNT(*)::int AS count FROM candidates WHERE tenant_id = $1', [tenantId]),
    pool.query(
      `SELECT COUNT(*)::int AS count FROM interviews i
       JOIN candidates c ON i.candidate_id = c.id
       WHERE c.tenant_id = $1 AND i.scheduled_at::date = CURRENT_DATE AND i.status != 'cancelled'`,
      [tenantId]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS count FROM candidates
       WHERE tenant_id = $1 AND stage IN ('applied', 'screening') AND updated_at < NOW() - INTERVAL '5 days'`,
      [tenantId]
    ),
    pool.query('SELECT COUNT(*)::int AS count FROM candidates WHERE tenant_id = $1 AND ai_score >= 8.5', [
      tenantId,
    ]),
    pool.query('SELECT stage, COUNT(*)::int AS count FROM candidates WHERE tenant_id = $1 GROUP BY stage', [
      tenantId,
    ]),
    pool.query(
      `SELECT u.name, COUNT(c.id) FILTER (WHERE c.stage = 'joined')::int AS placements,
        COUNT(c.id)::int AS total
      FROM users u
      LEFT JOIN candidates c ON c.recruiter_id = u.id AND c.tenant_id = u.tenant_id
      WHERE u.tenant_id = $1
      GROUP BY u.id, u.name`,
      [tenantId]
    ),
    pool.query(
      `SELECT TO_CHAR(DATE_TRUNC('month', updated_at), 'Mon') AS month,
        COUNT(*) FILTER (WHERE stage = 'joined')::int AS placements
      FROM candidates
      WHERE tenant_id = $1 AND updated_at >= NOW() - INTERVAL '6 months'
      GROUP BY DATE_TRUNC('month', updated_at)
      ORDER BY DATE_TRUNC('month', updated_at)`,
      [tenantId]
    ),
    pool.query(
      `SELECT
        CASE WHEN phone IS NOT NULL THEN 'WhatsApp' ELSE 'Other' END AS source,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE stage = 'joined')::int AS converted
      FROM candidates WHERE tenant_id = $1 GROUP BY 1`,
      [tenantId]
    ),
    pool.query("SELECT COUNT(*)::int AS count FROM jobs WHERE tenant_id = $1 AND status = 'active'", [tenantId]),
    pool.query("SELECT COUNT(*)::int AS count FROM candidates WHERE tenant_id = $1 AND stage = 'applied'", [tenantId]),
    pool.query(
      `SELECT COUNT(*)::int AS count FROM candidates
       WHERE tenant_id = $1 AND stage = 'joined' AND updated_at >= DATE_TRUNC('month', NOW())`,
      [tenantId]
    ),
  ]);

  const joined = stageCounts.rows.find((r) => r.stage === 'joined')?.count || 0;
  const total = totalCandidates.rows[0].count;
  const conversionRate = total > 0 ? Math.round((joined / total) * 100) : 0;

  const completedInterviews = await pool.query(
    `SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE i.score >= 7)::int AS passed
     FROM interviews i
     JOIN candidates c ON i.candidate_id = c.id
     WHERE c.tenant_id = $1 AND i.status = 'completed'`,
    [tenantId]
  );
  const iv = completedInterviews.rows[0];
  const interviewSuccess = iv.total > 0 ? Math.round((iv.passed / iv.total) * 100) : 68;

  res.json({
    kpis: {
      totalCandidates: total,
      interviewsToday: interviewsToday.rows[0].count,
      pendingFollowups: pendingFollowups.rows[0].count,
      hotCandidates: hotCandidates.rows[0].count,
      totalPlacements: joined,
      conversionRate,
      avgTimeToHire: 14,
      interviewSuccess,
      activeJobs: activeJobs.rows[0].count,
      newCandidates: newCandidates.rows[0].count,
      placementsMtd: placementsMtd.rows[0].count,
    },
    funnel: stageCounts.rows,
    recruiterPerformance: recruiterPerf.rows,
    monthlyPlacements: monthlyPlacements.rows,
    sourceConversion: sourceConversion.rows.map((s) => ({
      ...s,
      rate: s.total > 0 ? Math.round((s.converted / s.total) * 100) : 0,
    })),
  });
});

export default router;
