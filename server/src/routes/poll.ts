import { Router, type Request, type Response, type NextFunction } from 'express';
import { pool } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import {
  loadTenantBySlug,
  publicTenantLogoUrl,
  requireTenant,
  tenantMiddleware,
  type TenantRecord,
} from '../middleware/tenant.js';

const router = Router();

const PASS_THRESHOLD = 60;

type PollQuestionRow = {
  id: number;
  question: string;
  option1: string;
  option2: string;
  option3: string;
  option4: string;
  correct_option: number;
  is_active: boolean;
  sort_order: number;
};

type PollRow = {
  id: number;
  tenant_id: number;
  title: string;
  slug: string;
  description: string | null;
  status: 'open' | 'closed' | 'archived';
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

function requirePollAdmin(req: Request, res: Response): boolean {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
    res.status(403).json({ error: 'Admin access required' });
    return false;
  }
  return true;
}

function motivationalMessage(percentage: number) {
  if (percentage >= 90) return { tier: 'champion', emoji: '🏆', title: 'Recruitment Champion', message: 'Outstanding! You demonstrate elite recruitment knowledge.' };
  if (percentage >= 75) return { tier: 'great', emoji: '🌟', title: 'Great Job', message: 'Strong performance — keep sharpening your hiring craft.' };
  if (percentage >= 60) return { tier: 'good', emoji: '👍', title: 'Good Work', message: 'Solid foundation. A bit more practice will get you further.' };
  return { tier: 'improve', emoji: '📚', title: 'Needs Improvement', message: 'Review the fundamentals and try again when you are ready.' };
}

function csvEscape(value: unknown): string {
  const str = value == null ? '' : String(value);
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvEscape).join(',')];
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(','));
  }
  return lines.join('\n');
}

function normalizeMobile(mobile: string): string {
  return mobile.replace(/[\s\-()]/g, '').trim();
}

function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return base || 'poll';
}

function parsePollId(req: Request): number | null {
  const raw = req.query.pollId ?? req.body?.poll_id ?? req.body?.pollId;
  const id = Number(raw);
  if (!id || Number.isNaN(id)) return null;
  return id;
}

async function loadTenantPoll(tenantId: number, pollId: number): Promise<PollRow | null> {
  const { rows } = await pool.query<PollRow>(
    'SELECT * FROM polls WHERE id = $1 AND tenant_id = $2',
    [pollId, tenantId]
  );
  return rows[0] || null;
}

async function resolvePublicTenant(req: Request, res: Response): Promise<TenantRecord | null> {
  const slug = String(req.params.tenantSlug ?? '').trim().toLowerCase();
  if (!slug) {
    res.status(400).json({ error: 'Workspace slug is required' });
    return null;
  }
  const tenant = await loadTenantBySlug(slug);
  if (!tenant) {
    res.status(404).json({ error: 'Workspace not found' });
    return null;
  }
  if (tenant.status !== 'active' && tenant.status !== 'trial') {
    res.status(403).json({ error: 'This workspace is not accepting poll registrations' });
    return null;
  }
  return tenant;
}

async function resolvePublicPoll(
  req: Request,
  res: Response,
  opts: { requireOpen?: boolean } = {}
): Promise<{ tenant: TenantRecord; poll: PollRow } | null> {
  const tenant = await resolvePublicTenant(req, res);
  if (!tenant) return null;

  const pollSlug = String(req.params.pollSlug ?? '').trim().toLowerCase();
  if (!pollSlug) {
    res.status(400).json({ error: 'Poll slug is required' });
    return null;
  }

  const { rows } = await pool.query<PollRow>(
    'SELECT * FROM polls WHERE tenant_id = $1 AND slug = $2',
    [tenant.id, pollSlug]
  );
  const poll = rows[0];
  if (!poll) {
    res.status(404).json({ error: 'Poll not found' });
    return null;
  }
  if (opts.requireOpen && poll.status !== 'open') {
    res.status(403).json({ error: 'This poll is not open for registrations' });
    return null;
  }
  return { tenant, poll };
}

const adminGate = [authMiddleware, tenantMiddleware, requireTenant];

function withAdmin(...handlers: Array<(req: Request, res: Response, next: NextFunction) => unknown>) {
  return [...adminGate, ...handlers.map((h) => asyncHandler(h as never))];
}

const TENANT_LOGO_PATHS: Record<string, string> = {
  earlyjobs: '/brands/earlyjobs-logo.png',
};

function tenantBranding(tenant: TenantRecord) {
  return {
    slug: tenant.slug,
    name: tenant.name,
    logoInitials: tenant.logo_initials,
    primaryColor: tenant.primary_color,
    logoUrl: publicTenantLogoUrl(tenant.slug, tenant.logo_path) || TENANT_LOGO_PATHS[tenant.slug] || null,
  };
}

function pollSummary(poll: PollRow) {
  return {
    id: poll.id,
    title: poll.title,
    slug: poll.slug,
    description: poll.description,
    status: poll.status,
    is_default: poll.is_default,
  };
}

/* ── Admin poll CRUD ── */

router.get(
  '/polls',
  ...withAdmin(async (req, res) => {
    if (!requirePollAdmin(req, res)) return;
    const tenantId = req.tenant!.id;

    const { rows } = await pool.query(
      `SELECT p.*,
              (SELECT COUNT(*)::int FROM poll_questions q WHERE q.poll_id = p.id) AS question_count,
              (SELECT COUNT(*)::int FROM poll_recruiters r WHERE r.poll_id = p.id) AS recruiter_count,
              (SELECT COUNT(*)::int
               FROM poll_results res
               JOIN poll_recruiters r ON r.id = res.recruiter_id
               WHERE r.poll_id = p.id) AS attempt_count
       FROM polls p
       WHERE p.tenant_id = $1
       ORDER BY p.is_default DESC, p.created_at DESC, p.id DESC`,
      [tenantId]
    );

    res.json({
      polls: rows.map((p) => ({
        id: p.id,
        title: p.title,
        slug: p.slug,
        description: p.description,
        status: p.status,
        is_default: p.is_default,
        created_at: p.created_at,
        updated_at: p.updated_at,
        question_count: p.question_count,
        recruiter_count: p.recruiter_count,
        attempt_count: p.attempt_count,
      })),
    });
  })
);

router.post(
  '/polls',
  ...withAdmin(async (req, res) => {
    if (!requirePollAdmin(req, res)) return;
    const tenantId = req.tenant!.id;

    const title = String(req.body?.title ?? '').trim();
    if (!title) return res.status(400).json({ error: 'Title is required' });

    let slug = String(req.body?.slug ?? '').trim().toLowerCase();
    if (slug) {
      slug = slugify(slug);
    } else {
      slug = slugify(title);
    }
    const description =
      req.body?.description != null ? String(req.body.description).trim() || null : null;

    // Ensure unique slug within tenant
    let candidate = slug;
    let n = 2;
    for (;;) {
      const { rows } = await pool.query(
        'SELECT id FROM polls WHERE tenant_id = $1 AND slug = $2',
        [tenantId, candidate]
      );
      if (!rows[0]) break;
      candidate = `${slug}-${n}`.slice(0, 64);
      n += 1;
    }

    const { rows } = await pool.query(
      `INSERT INTO polls (tenant_id, title, slug, description, status, is_default)
       VALUES ($1, $2, $3, $4, 'open', FALSE)
       RETURNING *`,
      [tenantId, title, candidate, description]
    );

    res.status(201).json({ poll: pollSummary(rows[0]) });
  })
);

router.put(
  '/polls/:pollId',
  ...withAdmin(async (req, res) => {
    if (!requirePollAdmin(req, res)) return;
    const tenantId = req.tenant!.id;
    const pollId = Number(req.params.pollId);
    if (!pollId || Number.isNaN(pollId)) return res.status(400).json({ error: 'Invalid poll id' });

    const existing = await loadTenantPoll(tenantId, pollId);
    if (!existing) return res.status(404).json({ error: 'Poll not found' });

    const title = req.body?.title != null ? String(req.body.title).trim() : existing.title;
    if (!title) return res.status(400).json({ error: 'Title is required' });

    let slug = existing.slug;
    if (req.body?.slug != null) {
      slug = slugify(String(req.body.slug));
      const { rows: clash } = await pool.query(
        'SELECT id FROM polls WHERE tenant_id = $1 AND slug = $2 AND id <> $3',
        [tenantId, slug, pollId]
      );
      if (clash[0]) return res.status(409).json({ error: 'Another poll already uses this slug' });
    }

    const description =
      req.body?.description !== undefined
        ? String(req.body.description ?? '').trim() || null
        : existing.description;

    let status = existing.status;
    if (req.body?.status != null) {
      const next = String(req.body.status).trim().toLowerCase();
      if (!['open', 'closed', 'archived'].includes(next)) {
        return res.status(400).json({ error: 'status must be open, closed, or archived' });
      }
      status = next as PollRow['status'];
    }

    let isDefault = existing.is_default;
    if (req.body?.is_default === true || req.body?.isDefault === true) {
      await pool.query('UPDATE polls SET is_default = FALSE WHERE tenant_id = $1', [tenantId]);
      isDefault = true;
    }

    const { rows } = await pool.query(
      `UPDATE polls SET
         title = $1, slug = $2, description = $3, status = $4, is_default = $5, updated_at = NOW()
       WHERE id = $6 AND tenant_id = $7
       RETURNING *`,
      [title, slug, description, status, isDefault, pollId, tenantId]
    );

    res.json({ poll: pollSummary(rows[0]) });
  })
);

router.delete(
  '/polls/:pollId',
  ...withAdmin(async (req, res) => {
    if (!requirePollAdmin(req, res)) return;
    const tenantId = req.tenant!.id;
    const pollId = Number(req.params.pollId);
    if (!pollId || Number.isNaN(pollId)) return res.status(400).json({ error: 'Invalid poll id' });

    const existing = await loadTenantPoll(tenantId, pollId);
    if (!existing) return res.status(404).json({ error: 'Poll not found' });

    const { rows: countRows } = await pool.query(
      'SELECT COUNT(*)::int AS c FROM polls WHERE tenant_id = $1',
      [tenantId]
    );
    if (countRows[0].c <= 1) {
      return res.status(400).json({ error: 'Cannot delete the last poll for this workspace' });
    }

    await pool.query('DELETE FROM polls WHERE id = $1 AND tenant_id = $2', [pollId, tenantId]);

    if (existing.is_default) {
      await pool.query(
        `UPDATE polls SET is_default = TRUE, updated_at = NOW()
         WHERE id = (
           SELECT id FROM polls WHERE tenant_id = $1 ORDER BY created_at ASC, id ASC LIMIT 1
         )`,
        [tenantId]
      );
    }

    res.status(204).send();
  })
);

/* ── Admin analytics / questions (poll-scoped) ── */

router.get(
  '/dashboard',
  ...withAdmin(async (req, res) => {
    if (!requirePollAdmin(req, res)) return;
    const tenantId = req.tenant!.id;
    const pollId = parsePollId(req);
    if (!pollId) return res.status(400).json({ error: 'pollId is required' });

    const poll = await loadTenantPoll(tenantId, pollId);
    if (!poll) return res.status(404).json({ error: 'Poll not found' });

    const [
      totalRecruiters,
      totalAttempts,
      avgScore,
      passFail,
      recruiterScores,
      companyParticipation,
      questionAccuracy,
    ] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS count FROM poll_recruiters WHERE poll_id = $1', [pollId]),
      pool.query(
        `SELECT COUNT(*)::int AS count
         FROM poll_results r
         JOIN poll_recruiters pr ON pr.id = r.recruiter_id
         WHERE pr.poll_id = $1`,
        [pollId]
      ),
      pool.query(
        `SELECT COALESCE(ROUND(AVG(r.percentage)::numeric, 2), 0) AS avg
         FROM poll_results r
         JOIN poll_recruiters pr ON pr.id = r.recruiter_id
         WHERE pr.poll_id = $1`,
        [pollId]
      ),
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE r.status = 'pass')::int AS passed,
           COUNT(*) FILTER (WHERE r.status = 'fail')::int AS failed,
           COUNT(*)::int AS total
         FROM poll_results r
         JOIN poll_recruiters pr ON pr.id = r.recruiter_id
         WHERE pr.poll_id = $1`,
        [pollId]
      ),
      pool.query(
        `SELECT pr.name, r.score, r.percentage, r.status
         FROM poll_results r
         JOIN poll_recruiters pr ON pr.id = r.recruiter_id
         WHERE pr.poll_id = $1
         ORDER BY r.score DESC, pr.name ASC
         LIMIT 50`,
        [pollId]
      ),
      pool.query(
        `SELECT company_name AS company, COUNT(*)::int AS recruiters
         FROM poll_recruiters
         WHERE poll_id = $1
         GROUP BY company_name
         ORDER BY recruiters DESC, company_name ASC
         LIMIT 30`,
        [pollId]
      ),
      pool.query(
        `SELECT q.id, q.sort_order, q.question,
           COUNT(resp.id)::int AS attempts,
           COUNT(resp.id) FILTER (WHERE resp.is_correct)::int AS correct_count,
           CASE WHEN COUNT(resp.id) = 0 THEN 0
                ELSE ROUND((COUNT(resp.id) FILTER (WHERE resp.is_correct)::numeric / COUNT(resp.id)) * 100, 1)
           END AS accuracy
         FROM poll_questions q
         LEFT JOIN poll_responses resp ON resp.question_id = q.id
         WHERE q.poll_id = $1 AND q.is_active = TRUE
         GROUP BY q.id
         ORDER BY q.sort_order ASC, q.id ASC`,
        [pollId]
      ),
    ]);

    const pf = passFail.rows[0];
    const total = pf.total || 0;
    const passed = pf.passed || 0;
    const failed = pf.failed || 0;
    const passPercentage = total === 0 ? 0 : Math.round((passed / total) * 10000) / 100;
    const failPercentage = total === 0 ? 0 : Math.round((failed / total) * 10000) / 100;

    res.json({
      tenant: { id: req.tenant!.id, slug: req.tenant!.slug, name: req.tenant!.name },
      poll: pollSummary(poll),
      cards: {
        total_recruiters: totalRecruiters.rows[0].count,
        total_attempts: totalAttempts.rows[0].count,
        average_score: Number(avgScore.rows[0].avg),
        pass_percentage: passPercentage,
        fail_percentage: failPercentage,
      },
      charts: {
        recruiter_scores: recruiterScores.rows.map((r) => ({
          name: r.name,
          score: r.score,
          percentage: Number(r.percentage),
          status: r.status,
        })),
        company_participation: companyParticipation.rows,
        pass_vs_fail: [
          { name: 'Completed Successfully', value: passed, key: 'pass' },
          { name: 'Failed', value: failed, key: 'fail' },
        ],
        question_accuracy: questionAccuracy.rows.map((q, idx) => ({
          question: `Question ${q.sort_order || idx + 1}`,
          question_id: q.id,
          accuracy: Number(q.accuracy),
          attempts: q.attempts,
          correct_count: q.correct_count,
          full_question: q.question,
        })),
      },
    });
  })
);

router.get(
  '/recruiters',
  ...withAdmin(async (req, res) => {
    if (!requirePollAdmin(req, res)) return;
    const tenantId = req.tenant!.id;
    const pollId = parsePollId(req);
    if (!pollId) return res.status(400).json({ error: 'pollId is required' });

    const poll = await loadTenantPoll(tenantId, pollId);
    if (!poll) return res.status(404).json({ error: 'Poll not found' });

    const search = String(req.query.search ?? '').trim();
    const status = String(req.query.status ?? '').trim().toLowerCase();
    const company = String(req.query.company ?? '').trim();
    const sort = String(req.query.sort ?? 'completed_at');
    const order = String(req.query.order ?? 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    const sortMap: Record<string, string> = {
      name: 'pr.name',
      email: 'pr.email',
      company: 'pr.company_name',
      score: 'r.score',
      percentage: 'r.percentage',
      status: 'r.status',
      completed_at: 'r.completed_at',
      created_at: 'pr.created_at',
    };
    const sortCol = sortMap[sort] || 'r.completed_at';

    const params: unknown[] = [pollId];
    const where: string[] = ['pr.poll_id = $1'];

    if (search) {
      params.push(`%${search}%`);
      const i = params.length;
      where.push(`(pr.name ILIKE $${i} OR pr.email ILIKE $${i} OR pr.mobile ILIKE $${i} OR pr.company_name ILIKE $${i})`);
    }
    if (status === 'pass' || status === 'fail') {
      params.push(status);
      where.push(`r.status = $${params.length}`);
    }
    if (company) {
      params.push(company);
      where.push(`pr.company_name = $${params.length}`);
    }

    const { rows } = await pool.query(
      `SELECT pr.id, pr.name, pr.email, pr.mobile, pr.company_name, pr.created_at, pr.tenant_id, pr.poll_id,
              r.score, r.percentage, r.status, r.completed_at,
              r.total_questions, r.correct_answers, r.wrong_answers
       FROM poll_recruiters pr
       LEFT JOIN poll_results r ON r.recruiter_id = pr.id
       WHERE ${where.join(' AND ')}
       ORDER BY ${sortCol} ${order} NULLS LAST, pr.id DESC`,
      params
    );

    res.json({
      poll: pollSummary(poll),
      recruiters: rows.map((row) => ({
        ...row,
        percentage: row.percentage != null ? Number(row.percentage) : null,
      })),
    });
  })
);

router.get(
  '/recruiters/:id/responses',
  ...withAdmin(async (req, res) => {
    if (!requirePollAdmin(req, res)) return;
    const tenantId = req.tenant!.id;
    const id = Number(req.params.id);
    if (!id || Number.isNaN(id)) return res.status(400).json({ error: 'Invalid recruiter id' });

    const { rows: recruiterRows } = await pool.query(
      `SELECT pr.*, r.score, r.percentage, r.status, r.completed_at,
              r.total_questions, r.correct_answers, r.wrong_answers
       FROM poll_recruiters pr
       LEFT JOIN poll_results r ON r.recruiter_id = pr.id
       WHERE pr.id = $1 AND pr.tenant_id = $2`,
      [id, tenantId]
    );
    if (!recruiterRows[0]) return res.status(404).json({ error: 'Recruiter not found' });

    const { rows: responses } = await pool.query(
      `SELECT resp.id, resp.question_id, resp.selected_option, resp.is_correct,
              q.question, q.option1, q.option2, q.option3, q.option4, q.correct_option, q.sort_order
       FROM poll_responses resp
       JOIN poll_questions q ON q.id = resp.question_id
       WHERE resp.recruiter_id = $1 AND q.poll_id = $2
       ORDER BY q.sort_order ASC, q.id ASC`,
      [id, recruiterRows[0].poll_id]
    );

    const recruiter = recruiterRows[0];
    res.json({
      recruiter: {
        ...recruiter,
        percentage: recruiter.percentage != null ? Number(recruiter.percentage) : null,
      },
      responses,
    });
  })
);

router.get(
  '/export/recruiters',
  ...withAdmin(async (req, res) => {
    if (!requirePollAdmin(req, res)) return;
    const tenantId = req.tenant!.id;
    const pollId = parsePollId(req);
    if (!pollId) return res.status(400).json({ error: 'pollId is required' });

    const poll = await loadTenantPoll(tenantId, pollId);
    if (!poll) return res.status(404).json({ error: 'Poll not found' });

    const { rows } = await pool.query(
      `SELECT pr.name, pr.email, pr.mobile, pr.company_name,
              r.score, r.percentage, r.status, r.completed_at,
              r.correct_answers, r.wrong_answers, r.total_questions
       FROM poll_recruiters pr
       LEFT JOIN poll_results r ON r.recruiter_id = pr.id
       WHERE pr.poll_id = $1
       ORDER BY r.completed_at DESC NULLS LAST, pr.created_at DESC`,
      [pollId]
    );

    const csv = toCsv(
      ['Name', 'Email', 'Mobile', 'Company', 'Score', 'Percentage', 'Status', 'Attempt Date', 'Correct', 'Wrong', 'Total Questions'],
      rows.map((r) => [
        r.name,
        r.email,
        r.mobile,
        r.company_name,
        r.score ?? '',
        r.percentage != null ? Number(r.percentage) : '',
        r.status ?? 'Not Attempted',
        r.completed_at ? new Date(r.completed_at).toISOString() : '',
        r.correct_answers ?? '',
        r.wrong_answers ?? '',
        r.total_questions ?? '',
      ])
    );

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="poll-recruiters-${req.tenant!.slug}-${poll.slug}.csv"`
    );
    res.send('\uFEFF' + csv);
  })
);

router.get(
  '/admin/questions',
  ...withAdmin(async (req, res) => {
    if (!requirePollAdmin(req, res)) return;
    const tenantId = req.tenant!.id;
    const pollId = parsePollId(req);
    if (!pollId) return res.status(400).json({ error: 'pollId is required' });

    const poll = await loadTenantPoll(tenantId, pollId);
    if (!poll) return res.status(404).json({ error: 'Poll not found' });

    const { rows } = await pool.query(
      `SELECT * FROM poll_questions WHERE poll_id = $1 ORDER BY sort_order ASC, id ASC`,
      [pollId]
    );
    res.json({ poll: pollSummary(poll), questions: rows });
  })
);

router.post(
  '/admin/questions',
  ...withAdmin(async (req, res) => {
    if (!requirePollAdmin(req, res)) return;
    const tenantId = req.tenant!.id;
    const pollId = parsePollId(req);
    if (!pollId) return res.status(400).json({ error: 'pollId is required' });

    const poll = await loadTenantPoll(tenantId, pollId);
    if (!poll) return res.status(404).json({ error: 'Poll not found' });

    const question = String(req.body?.question ?? '').trim();
    const option1 = String(req.body?.option1 ?? '').trim();
    const option2 = String(req.body?.option2 ?? '').trim();
    const option3 = String(req.body?.option3 ?? '').trim();
    const option4 = String(req.body?.option4 ?? '').trim();
    const correct_option = Number(req.body?.correct_option);
    const is_active = req.body?.is_active !== false;
    let sort_order = Number(req.body?.sort_order);

    if (!question || !option1 || !option2 || !option3 || !option4) {
      return res.status(400).json({ error: 'Question and all four options are required' });
    }
    if (![1, 2, 3, 4].includes(correct_option)) {
      return res.status(400).json({ error: 'correct_option must be 1, 2, 3, or 4' });
    }
    if (!sort_order || Number.isNaN(sort_order)) {
      const { rows } = await pool.query(
        'SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM poll_questions WHERE poll_id = $1',
        [pollId]
      );
      sort_order = rows[0].next;
    }

    const { rows } = await pool.query(
      `INSERT INTO poll_questions
        (tenant_id, poll_id, question, option1, option2, option3, option4, correct_option, is_active, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [tenantId, pollId, question, option1, option2, option3, option4, correct_option, is_active, sort_order]
    );
    res.status(201).json({ question: rows[0] });
  })
);

router.put(
  '/admin/questions/:id',
  ...withAdmin(async (req, res) => {
    if (!requirePollAdmin(req, res)) return;
    const tenantId = req.tenant!.id;
    const id = Number(req.params.id);
    if (!id || Number.isNaN(id)) return res.status(400).json({ error: 'Invalid question id' });

    const { rows: existing } = await pool.query(
      'SELECT * FROM poll_questions WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );
    if (!existing[0]) return res.status(404).json({ error: 'Question not found' });

    const cur = existing[0];
    const question = req.body?.question != null ? String(req.body.question).trim() : cur.question;
    const option1 = req.body?.option1 != null ? String(req.body.option1).trim() : cur.option1;
    const option2 = req.body?.option2 != null ? String(req.body.option2).trim() : cur.option2;
    const option3 = req.body?.option3 != null ? String(req.body.option3).trim() : cur.option3;
    const option4 = req.body?.option4 != null ? String(req.body.option4).trim() : cur.option4;
    const correct_option =
      req.body?.correct_option != null ? Number(req.body.correct_option) : cur.correct_option;
    const is_active = req.body?.is_active != null ? Boolean(req.body.is_active) : cur.is_active;
    const sort_order = req.body?.sort_order != null ? Number(req.body.sort_order) : cur.sort_order;

    if (!question || !option1 || !option2 || !option3 || !option4) {
      return res.status(400).json({ error: 'Question and all four options are required' });
    }
    if (![1, 2, 3, 4].includes(correct_option)) {
      return res.status(400).json({ error: 'correct_option must be 1, 2, 3, or 4' });
    }

    const { rows } = await pool.query(
      `UPDATE poll_questions SET
         question = $1, option1 = $2, option2 = $3, option3 = $4, option4 = $5,
         correct_option = $6, is_active = $7, sort_order = $8
       WHERE id = $9 AND tenant_id = $10
       RETURNING *`,
      [question, option1, option2, option3, option4, correct_option, is_active, sort_order, id, tenantId]
    );
    res.json({ question: rows[0] });
  })
);

router.delete(
  '/admin/questions/:id',
  ...withAdmin(async (req, res) => {
    if (!requirePollAdmin(req, res)) return;
    const id = Number(req.params.id);
    if (!id || Number.isNaN(id)) return res.status(400).json({ error: 'Invalid question id' });

    const { rowCount } = await pool.query(
      'DELETE FROM poll_questions WHERE id = $1 AND tenant_id = $2',
      [id, req.tenant!.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Question not found' });
    res.status(204).send();
  })
);

/* ── Public routes ── */

router.get(
  '/:tenantSlug/meta',
  asyncHandler(async (req, res) => {
    const tenant = await resolvePublicTenant(req, res);
    if (!tenant) return;

    const { rows } = await pool.query<PollRow>(
      `SELECT id, title, slug, description, status, is_default, created_at, updated_at, tenant_id
       FROM polls
       WHERE tenant_id = $1 AND status = 'open'
       ORDER BY is_default DESC, created_at DESC, id DESC`,
      [tenant.id]
    );

    res.json({
      ...tenantBranding(tenant),
      polls: rows.map((p) => ({
        id: p.id,
        title: p.title,
        slug: p.slug,
        description: p.description,
      })),
    });
  })
);

router.get(
  '/:tenantSlug/:pollSlug/meta',
  asyncHandler(async (req, res) => {
    const resolved = await resolvePublicPoll(req, res);
    if (!resolved) return;
    const { tenant, poll } = resolved;

    res.json({
      ...tenantBranding(tenant),
      poll: {
        id: poll.id,
        title: poll.title,
        slug: poll.slug,
        description: poll.description,
        status: poll.status,
      },
    });
  })
);

router.post(
  '/:tenantSlug/:pollSlug/register',
  asyncHandler(async (req, res) => {
    const resolved = await resolvePublicPoll(req, res, { requireOpen: true });
    if (!resolved) return;
    const { tenant, poll } = resolved;

    const name = String(req.body?.name ?? '').trim();
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const mobile = normalizeMobile(String(req.body?.mobile ?? ''));
    const company_name = String(req.body?.company_name ?? req.body?.companyName ?? '').trim();

    if (!name || !email || !mobile || !company_name) {
      return res.status(400).json({ error: 'Full name, email, mobile, and company name are required' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }
    if (!/^\+?\d{8,15}$/.test(mobile)) {
      return res.status(400).json({ error: 'Please enter a valid mobile number' });
    }

    const existing = await pool.query(
      `SELECT id, email, mobile FROM poll_recruiters
       WHERE poll_id = $1 AND (email = $2 OR mobile = $3)
       LIMIT 1`,
      [poll.id, email, mobile]
    );
    if (existing.rows[0]) {
      const row = existing.rows[0];
      if (row.email === email) {
        return res.status(409).json({
          error: 'This email is already registered for this poll',
          recruiter_id: row.id,
        });
      }
      return res.status(409).json({
        error: 'This mobile number is already registered for this poll',
        recruiter_id: row.id,
      });
    }

    const { rows } = await pool.query(
      `INSERT INTO poll_recruiters (tenant_id, poll_id, name, email, mobile, company_name)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, tenant_id, poll_id, name, email, mobile, company_name, created_at`,
      [tenant.id, poll.id, name, email, mobile, company_name]
    );

    res.status(201).json({
      recruiter: rows[0],
      tenant: { slug: tenant.slug, name: tenant.name },
      poll: pollSummary(poll),
    });
  })
);

router.get(
  '/:tenantSlug/:pollSlug/questions',
  asyncHandler(async (req, res) => {
    const resolved = await resolvePublicPoll(req, res, { requireOpen: true });
    if (!resolved) return;
    const { tenant, poll } = resolved;

    const { rows } = await pool.query<PollQuestionRow>(
      `SELECT id, question, option1, option2, option3, option4, sort_order
       FROM poll_questions
       WHERE poll_id = $1 AND is_active = TRUE
       ORDER BY sort_order ASC, id ASC`,
      [poll.id]
    );

    res.json({
      tenant: { slug: tenant.slug, name: tenant.name },
      poll: pollSummary(poll),
      questions: rows.map((q) => ({
        id: q.id,
        question: q.question,
        option1: q.option1,
        option2: q.option2,
        option3: q.option3,
        option4: q.option4,
        sort_order: q.sort_order,
      })),
      total: rows.length,
    });
  })
);

router.post(
  '/:tenantSlug/:pollSlug/submit',
  asyncHandler(async (req, res) => {
    const resolved = await resolvePublicPoll(req, res, { requireOpen: true });
    if (!resolved) return;
    const { poll } = resolved;

    const recruiterId = Number(req.body?.recruiter_id ?? req.body?.recruiterId);
    const answers = req.body?.answers as
      | Array<{
          question_id?: number;
          questionId?: number;
          selected_option?: number;
          selectedOption?: number;
        }>
      | undefined;

    if (!recruiterId || Number.isNaN(recruiterId)) {
      return res.status(400).json({ error: 'recruiter_id is required' });
    }
    if (!Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({ error: 'answers are required' });
    }

    const { rows: recruiters } = await pool.query(
      'SELECT id FROM poll_recruiters WHERE id = $1 AND poll_id = $2',
      [recruiterId, poll.id]
    );
    if (!recruiters[0]) return res.status(404).json({ error: 'Recruiter not found for this poll' });

    const { rows: questions } = await pool.query<PollQuestionRow>(
      `SELECT id, correct_option FROM poll_questions
       WHERE poll_id = $1 AND is_active = TRUE
       ORDER BY sort_order ASC, id ASC`,
      [poll.id]
    );
    if (questions.length === 0) {
      return res.status(400).json({ error: 'No active questions available' });
    }

    const answerMap = new Map<number, number>();
    for (const a of answers) {
      const qid = Number(a.question_id ?? a.questionId);
      const selected = Number(a.selected_option ?? a.selectedOption);
      if (!qid || Number.isNaN(qid) || ![1, 2, 3, 4].includes(selected)) {
        return res.status(400).json({ error: 'Each answer needs question_id and selected_option (1–4)' });
      }
      answerMap.set(qid, selected);
    }

    for (const q of questions) {
      if (!answerMap.has(q.id)) {
        return res.status(400).json({ error: 'Please answer all questions before submitting' });
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM poll_responses WHERE recruiter_id = $1', [recruiterId]);

      let correct = 0;
      for (const q of questions) {
        const selected = answerMap.get(q.id)!;
        const isCorrect = selected === q.correct_option;
        if (isCorrect) correct += 1;
        await client.query(
          `INSERT INTO poll_responses (recruiter_id, question_id, selected_option, is_correct)
           VALUES ($1, $2, $3, $4)`,
          [recruiterId, q.id, selected, isCorrect]
        );
      }

      const total = questions.length;
      const wrong = total - correct;
      const percentage = Math.round((correct / total) * 10000) / 100;
      const status = percentage >= PASS_THRESHOLD ? 'pass' : 'fail';

      const { rows: resultRows } = await client.query(
        `INSERT INTO poll_results
          (recruiter_id, score, percentage, status, total_questions, correct_answers, wrong_answers, completed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT (recruiter_id) DO UPDATE SET
           score = EXCLUDED.score,
           percentage = EXCLUDED.percentage,
           status = EXCLUDED.status,
           total_questions = EXCLUDED.total_questions,
           correct_answers = EXCLUDED.correct_answers,
           wrong_answers = EXCLUDED.wrong_answers,
           completed_at = NOW()
         RETURNING *`,
        [recruiterId, correct, percentage, status, total, correct, wrong]
      );

      await client.query('COMMIT');

      const result = resultRows[0];
      res.json({
        result: {
          id: result.id,
          recruiter_id: result.recruiter_id,
          score: result.score,
          percentage: Number(result.percentage),
          status: result.status,
          total_questions: result.total_questions,
          correct_answers: result.correct_answers,
          wrong_answers: result.wrong_answers,
          completed_at: result.completed_at,
        },
        motivation: motivationalMessage(Number(result.percentage)),
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  })
);

router.get(
  '/:tenantSlug/:pollSlug/result/:recruiterId',
  asyncHandler(async (req, res) => {
    const resolved = await resolvePublicPoll(req, res);
    if (!resolved) return;
    const { poll } = resolved;

    const recruiterId = Number(req.params.recruiterId);
    if (!recruiterId || Number.isNaN(recruiterId)) {
      return res.status(400).json({ error: 'Invalid recruiter id' });
    }

    const { rows } = await pool.query(
      `SELECT r.*, pr.name, pr.email, pr.mobile, pr.company_name
       FROM poll_results r
       JOIN poll_recruiters pr ON pr.id = r.recruiter_id
       WHERE r.recruiter_id = $1 AND pr.poll_id = $2`,
      [recruiterId, poll.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Result not found — assessment not completed yet' });

    const row = rows[0];
    const percentage = Number(row.percentage);
    res.json({
      result: {
        id: row.id,
        recruiter_id: row.recruiter_id,
        name: row.name,
        email: row.email,
        mobile: row.mobile,
        company_name: row.company_name,
        score: row.score,
        percentage,
        status: row.status,
        total_questions: row.total_questions,
        correct_answers: row.correct_answers,
        wrong_answers: row.wrong_answers,
        completed_at: row.completed_at,
      },
      motivation: motivationalMessage(percentage),
    });
  })
);

export default router;
