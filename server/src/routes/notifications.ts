import { Router, type Request } from 'express';
import { pool } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireTenant, tenantMiddleware } from '../middleware/tenant.js';

const router = Router();
router.use(authMiddleware);
router.use(tenantMiddleware);
router.use(requireTenant);

interface NotificationItem {
  id: string;
  kind: 'follow_up_overdue' | 'follow_up_today' | 'interview_today' | 'hot_candidate';
  title: string;
  detail: string;
  link: string;
  at: string;
}

/** SQL fragment scoping candidates (alias c) to what the current user can see. */
function scopeClause(req: Request, startIndex: number) {
  const role = req.user!.role;
  if (role === 'recruiter') {
    return { sql: ` AND c.recruiter_id = $${startIndex}`, params: [req.user!.id] as unknown[] };
  }
  if (role === 'hiring_manager') {
    return {
      sql: ` AND (c.recruiter_id = $${startIndex + 1} OR c.recruiter_id IN (
        SELECT r.id FROM users r WHERE r.tenant_id = $${startIndex} AND r.role = 'recruiter'
        AND (r.managed_by_id = $${startIndex + 1} OR r.company_id = (SELECT company_id FROM users WHERE id = $${startIndex + 1}))
      ))`,
      params: [req.tenant!.id, req.user!.id] as unknown[],
    };
  }
  return { sql: '', params: [] as unknown[] };
}

router.get('/', async (req, res) => {
  const tenantId = req.tenant!.id;
  const scope = scopeClause(req, 2);

  const [followUps, interviews, hot] = await Promise.all([
    pool.query(
      `SELECT f.id, f.due_at, f.type, c.id AS candidate_id, c.name AS candidate_name
       FROM follow_ups f
       JOIN candidates c ON c.id = f.candidate_id AND c.tenant_id = f.tenant_id
       WHERE f.tenant_id = $1
         AND f.completed_at IS NULL
         AND f.status NOT IN ('completed', 'missed')
         AND f.due_at < (CURRENT_DATE + 1)${scope.sql}
       ORDER BY f.due_at ASC
       LIMIT 10`,
      [tenantId, ...scope.params]
    ),
    pool.query(
      `SELECT i.id, i.scheduled_at, i.round_type, c.id AS candidate_id, c.name AS candidate_name
       FROM interviews i
       JOIN candidates c ON c.id = i.candidate_id
       WHERE c.tenant_id = $1
         AND i.status NOT IN ('cancelled', 'completed')
         AND i.scheduled_at::date = CURRENT_DATE
         AND i.scheduled_at >= NOW()${scope.sql}
       ORDER BY i.scheduled_at ASC
       LIMIT 10`,
      [tenantId, ...scope.params]
    ),
    pool.query(
      `SELECT c.id AS candidate_id, c.name AS candidate_name, c.stage, c.updated_at, u.name AS recruiter_name
       FROM candidates c
       LEFT JOIN users u ON u.id = c.recruiter_id AND u.tenant_id = c.tenant_id
       WHERE c.tenant_id = $1 AND c.is_hot = TRUE
         AND c.stage NOT IN ('joined', 'rejected')${scope.sql}
       ORDER BY c.updated_at DESC
       LIMIT 5`,
      [tenantId, ...scope.params]
    ),
  ]);

  const now = Date.now();
  const items: NotificationItem[] = [];

  for (const f of followUps.rows) {
    const overdue = new Date(f.due_at).getTime() < now;
    items.push({
      id: `fu-${f.id}`,
      kind: overdue ? 'follow_up_overdue' : 'follow_up_today',
      title: overdue ? 'Overdue follow-up' : 'Follow-up due today',
      detail: `${f.candidate_name} · ${f.type}`,
      link: '/follow-ups',
      at: f.due_at,
    });
  }
  for (const iv of interviews.rows) {
    items.push({
      id: `iv-${iv.id}`,
      kind: 'interview_today',
      title: 'Interview today',
      detail: `${iv.candidate_name} · ${iv.round_type}`,
      link: `/candidates/${iv.candidate_id}`,
      at: iv.scheduled_at,
    });
  }
  for (const c of hot.rows) {
    items.push({
      id: `hot-${c.candidate_id}`,
      kind: 'hot_candidate',
      title: 'Hot candidate',
      detail: `${c.candidate_name} · ${c.stage}${c.recruiter_name ? ` · ${c.recruiter_name}` : ''}`,
      link: `/candidates/${c.candidate_id}`,
      at: c.updated_at,
    });
  }

  res.json({ count: items.length, items });
});

export default router;
