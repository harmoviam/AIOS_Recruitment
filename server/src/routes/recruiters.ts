import { Router, type Request } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireTenant, tenantMiddleware } from '../middleware/tenant.js';

const router = Router();
router.use(authMiddleware);
router.use(tenantMiddleware);
router.use(requireTenant);

const tid = (req: Request) => req.tenant!.id;

async function actorScope(req: Request) {
  const role = req.user!.role;
  if (role === 'admin') {
    return { canManage: true, companyId: null as number | null, hmId: null as number | null, isAdmin: true };
  }
  if (role === 'hiring_manager') {
    const { rows } = await pool.query(
      'SELECT company_id FROM users WHERE id = $1 AND tenant_id = $2',
      [req.user!.id, tid(req)]
    );
    return {
      canManage: true,
      companyId: rows[0]?.company_id ?? null,
      hmId: req.user!.id,
      isAdmin: false,
    };
  }
  return { canManage: false, companyId: null, hmId: null, isAdmin: false };
}

function hmRecruiterFilter(alias: string, hmId: number, companyId: number | null, startIdx: number) {
  if (companyId) {
    return {
      sql: ` AND (${alias}.managed_by_id = $${startIdx} OR ${alias}.company_id = $${startIdx + 1})`,
      params: [hmId, companyId],
    };
  }
  return { sql: ` AND ${alias}.managed_by_id = $${startIdx}`, params: [hmId] };
}

router.get('/my-workflow', async (req, res) => {
  if (req.user!.role !== 'recruiter') {
    return res.status(403).json({ error: 'Recruiter access only' });
  }
  const uid = req.user!.id;
  const tenantId = tid(req);

  const [byStage, followUps, interviewsToday, joiningsMtd, recentActivities] = await Promise.all([
    pool.query(
      `SELECT stage, COUNT(*)::int AS count FROM candidates
       WHERE tenant_id = $1 AND recruiter_id = $2 GROUP BY stage`,
      [tenantId, uid]
    ),
    pool.query(
      `SELECT COUNT(*) FILTER (WHERE f.status NOT IN ('completed'))::int AS pending,
        COUNT(*) FILTER (WHERE f.due_at < NOW() AND f.status NOT IN ('completed', 'missed'))::int AS overdue
       FROM follow_ups f
       JOIN candidates c ON c.id = f.candidate_id
       WHERE f.tenant_id = $1 AND c.recruiter_id = $2`,
      [tenantId, uid]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS c FROM interviews i
       JOIN candidates c ON c.id = i.candidate_id
       WHERE c.tenant_id = $1 AND c.recruiter_id = $2 AND i.scheduled_at::date = CURRENT_DATE`,
      [tenantId, uid]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS c FROM candidates
       WHERE tenant_id = $1 AND recruiter_id = $2 AND stage = 'joined'
       AND updated_at >= DATE_TRUNC('month', NOW())`,
      [tenantId, uid]
    ),
    pool.query(
      `SELECT a.id, a.type, a.description, a.created_at FROM activities a
       WHERE a.tenant_id = $1 AND a.candidate_id IN (SELECT id FROM candidates WHERE recruiter_id = $2)
       ORDER BY a.created_at DESC LIMIT 8`,
      [tenantId, uid]
    ),
  ]);

  const totalCandidates = byStage.rows.reduce((s, r) => s + r.count, 0);

  res.json({
    kpis: {
      totalCandidates,
      pendingFollowups: followUps.rows[0].pending,
      overdueFollowups: followUps.rows[0].overdue,
      interviewsToday: interviewsToday.rows[0].c,
      joiningsMtd: joiningsMtd.rows[0].c,
    },
    pipeline: byStage.rows,
    recentActivities: recentActivities.rows,
  });
});

router.get('/team-performance', async (req, res) => {
  const scope = await actorScope(req);
  if (!scope.canManage) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  let hmId: number | null = null;
  let companyId: number | null = null;

  if (scope.isAdmin) {
    const requestedHm = req.query.hm_id ? Number(req.query.hm_id) : null;
    if (requestedHm) {
      const { rows: hmRow } = await pool.query(
        'SELECT id, company_id FROM users WHERE id = $1 AND tenant_id = $2 AND role = $3',
        [requestedHm, tid(req), 'hiring_manager']
      );
      if (!hmRow[0]) return res.status(404).json({ error: 'Hiring manager not found' });
      hmId = hmRow[0].id;
      companyId = hmRow[0].company_id;
    }
  } else {
    if (!scope.hmId) return res.status(403).json({ error: 'Hiring Manager access required' });
    hmId = scope.hmId;
    companyId = scope.companyId;
  }

  const tenantId = tid(req);
  const params: unknown[] = [tenantId];
  let extraFilter = '';
  if (hmId) {
    const f = hmRecruiterFilter('u', hmId, companyId, 2);
    extraFilter = f.sql;
    params.push(...f.params);
  }

  const { rows: recruiters } = await pool.query(
    `SELECT u.id, u.name, u.email,
      (SELECT COUNT(*)::int FROM candidates c WHERE c.recruiter_id = u.id AND c.tenant_id = u.tenant_id) AS candidates,
      (SELECT COUNT(*)::int FROM candidates c WHERE c.recruiter_id = u.id AND c.tenant_id = u.tenant_id AND c.stage = 'interview') AS in_interview,
      (SELECT COUNT(*)::int FROM candidates c WHERE c.recruiter_id = u.id AND c.tenant_id = u.tenant_id
        AND c.stage = 'joined' AND c.updated_at >= DATE_TRUNC('month', NOW())) AS joinings_mtd,
      (SELECT COUNT(*)::int FROM follow_ups f JOIN candidates c ON c.id = f.candidate_id
        WHERE c.recruiter_id = u.id AND f.status NOT IN ('completed')) AS pending_followups
     FROM users u
     WHERE u.tenant_id = $1 AND u.role = 'recruiter'${extraFilter}
     ORDER BY joinings_mtd DESC, candidates DESC`,
    params
  );

  const team = recruiters.reduce(
    (acc, r) => ({
      candidates: acc.candidates + r.candidates,
      joiningsMtd: acc.joiningsMtd + r.joinings_mtd,
      inInterview: acc.inInterview + r.in_interview,
      pendingFollowups: acc.pendingFollowups + r.pending_followups,
    }),
    { candidates: 0, joiningsMtd: 0, inInterview: 0, pendingFollowups: 0 }
  );

  res.json({
    team,
    recruiters: recruiters.map((r, idx) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      candidates: r.candidates,
      inInterview: r.in_interview,
      joiningsMtd: r.joinings_mtd,
      pendingFollowups: r.pending_followups,
      conversionRate: r.candidates > 0 ? Math.round((r.joinings_mtd / r.candidates) * 100) : 0,
      rank: idx + 1,
    })),
  });
});

router.get('/stats', async (req, res) => {
  const scope = await actorScope(req);
  if (req.user!.role === 'recruiter') {
    return res.status(403).json({ error: 'Recruiters cannot manage the recruiter roster' });
  }
  if (!scope.canManage && !scope.isAdmin) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  const params: unknown[] = [tid(req)];
  let extraFilter = '';
  if (scope.isAdmin && req.query.hm_id) {
    const hmId = Number(req.query.hm_id);
    const { rows: hmRow } = await pool.query(
      'SELECT id, company_id FROM users WHERE id = $1 AND tenant_id = $2 AND role = $3',
      [hmId, tid(req), 'hiring_manager']
    );
    if (hmRow[0]) {
      const f = hmRecruiterFilter('u', hmRow[0].id, hmRow[0].company_id, 2);
      extraFilter = f.sql;
      params.push(...f.params);
    }
  } else if (!scope.isAdmin && scope.hmId) {
    const f = hmRecruiterFilter('u', scope.hmId, scope.companyId, 2);
    extraFilter = f.sql;
    params.push(...f.params);
  } else if (!scope.isAdmin && scope.hmId == null && req.user!.role === 'hiring_manager') {
    return res.json([]);
  }

  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.email, u.company_id, u.managed_by_id,
      co.name AS company, hm.name AS hiring_manager,
      (SELECT COUNT(*)::int FROM jobs j WHERE j.assigned_to = u.id AND j.tenant_id = u.tenant_id AND j.status = 'active') AS active_jobs,
      (SELECT COUNT(*)::int FROM candidates c WHERE c.recruiter_id = u.id AND c.tenant_id = u.tenant_id) AS candidates,
      (SELECT COUNT(*)::int FROM candidates c WHERE c.recruiter_id = u.id AND c.tenant_id = u.tenant_id AND c.stage = 'joined'
        AND c.updated_at >= DATE_TRUNC('month', NOW())) AS joinings_mtd
     FROM users u
     LEFT JOIN companies co ON co.id = u.company_id
     LEFT JOIN users hm ON hm.id = u.managed_by_id
     WHERE u.tenant_id = $1 AND u.role = 'recruiter'${extraFilter}
     ORDER BY joinings_mtd DESC, candidates DESC`,
    params
  );
  res.json(
    rows.map((r, idx) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      company: r.company || '—',
      company_id: r.company_id,
      managed_by_id: r.managed_by_id,
      hiringManager: r.hiring_manager || '—',
      activeJobs: r.active_jobs,
      candidates: r.candidates,
      joiningsMtd: r.joinings_mtd,
      rank: idx + 1,
      status: 'active',
    }))
  );
});

router.post('/', async (req, res) => {
  const scope = await actorScope(req);
  if (!scope.canManage) return res.status(403).json({ error: 'Not allowed to add recruiters' });

  const { email, password, name, company_id, managed_by_id } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Email, password, and name required' });
  }

  let resolvedCompanyId: number | null = null;
  let managedById: number | null = null;

  if (scope.isAdmin) {
    resolvedCompanyId = company_id ? Number(company_id) : null;
    if (managed_by_id !== undefined && managed_by_id !== null && managed_by_id !== '') {
      managedById = Number(managed_by_id);
    } else if (resolvedCompanyId) {
      const { rows: hm } = await pool.query(
        `SELECT id FROM users WHERE tenant_id = $1 AND role = 'hiring_manager' AND company_id = $2 LIMIT 1`,
        [tid(req), resolvedCompanyId]
      );
      managedById = hm[0]?.id ?? null;
    }
  } else {
    if (!scope.companyId) {
      return res.status(400).json({ error: 'Your account is not linked to a company. Contact your Organization Admin.' });
    }
    resolvedCompanyId = scope.companyId;
    managedById = scope.hmId;
  }

  const hash = bcrypt.hashSync(password, 10);
  try {
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, name, role, tenant_id, company_id, managed_by_id)
       VALUES ($1, $2, $3, 'recruiter', $4, $5, $6)
       RETURNING id, email, name, role, company_id, managed_by_id`,
      [email, hash, name, tid(req), resolvedCompanyId, managedById]
    );
    res.status(201).json(rows[0]);
  } catch (err: unknown) {
    if ((err as { code?: string }).code === '23505') {
      return res.status(409).json({ error: 'Email already registered in this workspace' });
    }
    throw err;
  }
});

router.patch('/:id', async (req, res) => {
  const scope = await actorScope(req);
  if (!scope.canManage) return res.status(403).json({ error: 'Not allowed to edit recruiters' });

  const { name, password, company_id, managed_by_id } = req.body;
  const { rows: existing } = await pool.query(
    'SELECT id, company_id, managed_by_id FROM users WHERE id = $1 AND tenant_id = $2 AND role = $3',
    [req.params.id, tid(req), 'recruiter']
  );
  if (!existing[0]) return res.status(404).json({ error: 'Recruiter not found' });

  if (!scope.isAdmin) {
    const ok =
      existing[0].managed_by_id === scope.hmId ||
      (scope.companyId && existing[0].company_id === scope.companyId);
    if (!ok) return res.status(403).json({ error: 'You can only edit recruiters on your team' });
  }

  const updates: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  if (name) {
    updates.push(`name = $${i++}`);
    params.push(name);
  }
  if (password) {
    updates.push(`password_hash = $${i++}`);
    params.push(bcrypt.hashSync(password, 10));
  }
  if (scope.isAdmin && company_id !== undefined) {
    updates.push(`company_id = $${i++}`);
    params.push(company_id || null);
  }
  if (scope.isAdmin && managed_by_id !== undefined) {
    updates.push(`managed_by_id = $${i++}`);
    params.push(managed_by_id || null);
  } else if (scope.isAdmin && company_id !== undefined) {
    let nextManagedBy: number | null = null;
    if (company_id) {
      const { rows: hm } = await pool.query(
        `SELECT id FROM users WHERE tenant_id = $1 AND role = 'hiring_manager' AND company_id = $2 LIMIT 1`,
        [tid(req), company_id]
      );
      nextManagedBy = hm[0]?.id ?? null;
    }
    updates.push(`managed_by_id = $${i++}`);
    params.push(nextManagedBy);
  }
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

  params.push(req.params.id, tid(req));
  const { rows } = await pool.query(
    `UPDATE users SET ${updates.join(', ')} WHERE id = $${i++} AND tenant_id = $${i} AND role = 'recruiter'
     RETURNING id, email, name, company_id`,
    params
  );
  res.json(rows[0]);
});

router.get('/dashboard', async (req, res) => {
  const tenantId = tid(req);
  const scope = await actorScope(req);

  let jobClientName: string | null = null;
  if (!scope.isAdmin && scope.companyId) {
    const { rows: co } = await pool.query('SELECT name FROM companies WHERE id = $1', [scope.companyId]);
    jobClientName = co[0]?.name ?? null;
  }

  const jobParams: unknown[] = [tenantId];
  const jobClientFilter = jobClientName ? ' AND client = $2' : '';
  if (jobClientName) jobParams.push(jobClientName);
  const candidateJobFilter = jobClientName ? ' AND j.client = $2' : '';

  const [jobs, selections, joinings, recruiterCount, pending] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS c FROM jobs WHERE tenant_id = $1 AND status = 'active'${jobClientFilter}`, jobParams),
    pool.query(
      `SELECT COUNT(*)::int AS c FROM candidates c JOIN jobs j ON j.id = c.job_id AND j.tenant_id = c.tenant_id
       WHERE c.tenant_id = $1 AND c.stage = 'selected'${candidateJobFilter}`,
      jobParams
    ),
    pool.query(
      `SELECT COUNT(*)::int AS c FROM candidates c JOIN jobs j ON j.id = c.job_id AND j.tenant_id = c.tenant_id
       WHERE c.tenant_id = $1 AND c.stage = 'joined' AND c.updated_at >= DATE_TRUNC('month', NOW())${candidateJobFilter}`,
      jobParams
    ),
    scope.isAdmin
      ? pool.query(`SELECT COUNT(*)::int AS c FROM users WHERE tenant_id = $1 AND role = 'recruiter'`, [tenantId])
      : pool.query(
          `SELECT COUNT(*)::int AS c FROM users u WHERE u.tenant_id = $1 AND u.role = 'recruiter'${hmRecruiterFilter('u', scope.hmId!, scope.companyId, 2).sql}`,
          [tenantId, ...hmRecruiterFilter('u', scope.hmId!, scope.companyId, 2).params]
        ),
    (() => {
      let sql = `SELECT c.id, c.name, j.title AS job_title, u.name AS recruiter_name
        FROM candidates c LEFT JOIN jobs j ON j.id = c.job_id LEFT JOIN users u ON u.id = c.recruiter_id
        WHERE c.tenant_id = $1 AND c.stage = 'selected'`;
      const p: unknown[] = [tenantId];
      if (jobClientName) {
        sql += ' AND j.client = $2';
        p.push(jobClientName);
      }
      sql += ' ORDER BY c.updated_at DESC LIMIT 10';
      return pool.query(sql, p);
    })(),
  ]);

  res.json({
    openPositions: jobs.rows[0].c,
    selections: selections.rows[0].c,
    joiningsMtd: joinings.rows[0].c,
    recruiterCount: recruiterCount.rows[0].c,
    pendingApprovals: pending.rows,
    userId: req.user!.id,
  });
});

export default router;
