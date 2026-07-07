import { Router, type Request } from 'express';
import { pool } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import {
  assertCandidateInTenant,
  assertJobInTenant,
  requireTenant,
  tenantClause,
  tenantMiddleware,
} from '../middleware/tenant.js';
import { promoteToInterviewStage } from '../services/candidateStage.js';
import { closeOpenFollowUps, onCandidateJoined } from '../services/followUpEngine.js';

const router = Router();
router.use(authMiddleware);
router.use(tenantMiddleware);
router.use(requireTenant);

const STAGES = ['applied', 'screening', 'interview', 'selected', 'rejected', 'joined'];
// Pre-screening scorecard: each question is scored 1-5 by the recruiter.
const SCREENING_QUESTION_FIELDS = [
  'commitment_language',
  'future_clarity',
  'opportunity_competition',
  'motivation_strength',
  'stability_indicators',
] as const;
// Red-flag signals observed in the first 3 minutes of the call, scored 1-5.
const RED_FLAG_FIELDS = [
  'low_energy',
  'vague_motivation',
  'uncertain_joining_timeline',
  'avoids_current_status',
  'salary_focus_early',
  'weak_communication',
  'non_committed_language',
] as const;

function screeningRiskLevel(totalScore: number): string {
  if (totalScore >= 20) return 'High Join Probability';
  if (totalScore >= 15) return 'Moderate Risk';
  return 'High Ghosting Risk';
}
const OFFER_STATUSES = ['screening_rejected', 'offer_rejected', 'not_interested', 'joined_elsewhere', 'left_company'];
// Statuses shown in list badges: OFFER_STATUSES plus the check-in outcomes set by the follow-up engine.
const DISPLAY_OFFER_STATUSES = [...OFFER_STATUSES, 'doing_well', 'issue_flagged', 'no_answer'];
const tid = (req: Request) => req.tenant!.id;

// `status` filters on the badge shown in the UI (offer_status when set, else stage).
function statusFilterClause(status: string, i: number): { sql: string; nextIndex: number } {
  if (DISPLAY_OFFER_STATUSES.includes(status)) {
    return { sql: ` AND c.offer_status = $${i}`, nextIndex: i + 1 };
  }
  return { sql: ` AND c.stage = $${i} AND c.offer_status IS NULL`, nextIndex: i + 1 };
}

router.get('/', async (req, res) => {
  const { job_id, stage, status, search, recruiter_id, scope, hot } = req.query;
  const t = tenantClause(tid(req), 'c', 1);
  let sql = `
    SELECT c.*, j.title AS job_title, u.name AS recruiter_name,
      COALESCE(
        (SELECT MIN(iv.scheduled_at) FROM interviews iv
         WHERE iv.candidate_id = c.id AND iv.scheduled_at >= NOW() AND iv.status <> 'cancelled'),
        (SELECT MAX(iv.scheduled_at) FROM interviews iv WHERE iv.candidate_id = c.id)
      ) AS interview_date
    FROM candidates c
    LEFT JOIN jobs j ON c.job_id = j.id AND j.tenant_id = c.tenant_id
    LEFT JOIN users u ON c.recruiter_id = u.id AND u.tenant_id = c.tenant_id
    WHERE ${t.sql}
  `;
  const params: unknown[] = [t.param];
  let i = t.nextIndex;

  if (job_id) {
    sql += ` AND c.job_id = $${i++}`;
    params.push(Number(job_id));
  }
  if (stage) {
    sql += ` AND c.stage = $${i++}`;
    params.push(stage);
  }
  if (status) {
    const clause = statusFilterClause(String(status), i);
    sql += clause.sql;
    params.push(status);
    i = clause.nextIndex;
  }
  if (search) {
    sql += ` AND (c.name ILIKE $${i} OR c.email ILIKE $${i})`;
    params.push(`%${search}%`);
    i++;
  }
  if (hot === 'true') {
    sql += ' AND c.is_hot = TRUE';
  }

  if (req.user!.role === 'recruiter') {
    sql += ` AND c.recruiter_id = $${i++}`;
    params.push(req.user!.id);
  } else if (req.user!.role === 'hiring_manager') {
    // HMs manage their team's candidates and can also own candidates themselves.
    // scope=my   -> only candidates the HM personally owns (recruiter_id = HM)
    // scope=team -> only the team's candidates (managed recruiters)
    // (default)  -> HM's own candidates + all managed recruiters' candidates
    const teamClause = `c.recruiter_id IN (
      SELECT r.id FROM users r WHERE r.tenant_id = $${i} AND r.role = 'recruiter'
      AND (r.managed_by_id = $${i + 1} OR r.company_id = (SELECT company_id FROM users WHERE id = $${i + 1}))
    )`;
    if (scope === 'my') {
      sql += ` AND c.recruiter_id = $${i}`;
      params.push(req.user!.id);
      i += 1;
    } else if (scope === 'team') {
      sql += ` AND (${teamClause})`;
      params.push(tid(req), req.user!.id);
      i += 2;
    } else {
      sql += ` AND (c.recruiter_id = $${i + 2} OR ${teamClause})`;
      params.push(tid(req), req.user!.id, req.user!.id);
      i += 3;
    }
  }

  // Filter down to a specific recruiter (used by HM/admin recruiter dropdown).
  if (recruiter_id) {
    sql += ` AND c.recruiter_id = $${i++}`;
    params.push(Number(recruiter_id));
  }

  sql += ' ORDER BY c.updated_at DESC';

  const { rows } = await pool.query(sql, params);
  res.json(rows);
});

router.get('/export', async (req, res) => {
  const { job_id, stage, status, search, ids, recruiter_id, scope } = req.query;
  const t = tenantClause(tid(req), 'c', 1);
  let sql = `
    SELECT c.name, c.email, c.phone, c.stage, j.title AS job_title, u.name AS recruiter_name, c.ai_score, c.updated_at
    FROM candidates c
    LEFT JOIN jobs j ON c.job_id = j.id AND j.tenant_id = c.tenant_id
    LEFT JOIN users u ON c.recruiter_id = u.id AND u.tenant_id = c.tenant_id
    WHERE ${t.sql}
  `;
  const params: unknown[] = [t.param];
  let i = t.nextIndex;

  if (ids) {
    const idList = String(ids).split(',').map(Number).filter(Boolean);
    if (idList.length) {
      sql += ` AND c.id = ANY($${i++}::int[])`;
      params.push(idList);
    }
  }
  if (job_id) {
    sql += ` AND c.job_id = $${i++}`;
    params.push(Number(job_id));
  }
  if (stage) {
    sql += ` AND c.stage = $${i++}`;
    params.push(stage);
  }
  if (status) {
    const clause = statusFilterClause(String(status), i);
    sql += clause.sql;
    params.push(status);
    i = clause.nextIndex;
  }
  if (search) {
    sql += ` AND (c.name ILIKE $${i} OR c.email ILIKE $${i})`;
    params.push(`%${search}%`);
    i++;
  }

  if (req.user!.role === 'recruiter') {
    sql += ` AND c.recruiter_id = $${i++}`;
    params.push(req.user!.id);
  } else if (req.user!.role === 'hiring_manager') {
    const teamClause = `c.recruiter_id IN (
      SELECT r.id FROM users r WHERE r.tenant_id = $${i} AND r.role = 'recruiter'
      AND (r.managed_by_id = $${i + 1} OR r.company_id = (SELECT company_id FROM users WHERE id = $${i + 1}))
    )`;
    if (scope === 'my') {
      sql += ` AND c.recruiter_id = $${i}`;
      params.push(req.user!.id);
      i += 1;
    } else if (scope === 'team') {
      sql += ` AND (${teamClause})`;
      params.push(tid(req), req.user!.id);
      i += 2;
    } else {
      sql += ` AND (c.recruiter_id = $${i + 2} OR ${teamClause})`;
      params.push(tid(req), req.user!.id, req.user!.id);
      i += 3;
    }
  }

  if (recruiter_id) {
    sql += ` AND c.recruiter_id = $${i++}`;
    params.push(Number(recruiter_id));
  }

  sql += ' ORDER BY c.updated_at DESC';

  const { rows } = await pool.query(sql, params);
  const headers = ['name', 'email', 'phone', 'stage', 'job_title', 'recruiter_name', 'ai_score', 'updated_at'];
  const csv = [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => JSON.stringify(r[h] ?? '')).join(',')),
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="candidates.csv"');
  res.send(csv);
});

router.post('/import/validate', async (req, res) => {
  const { rows: rowData, default_job_id } = req.body as {
    rows: Record<string, string>[];
    default_job_id?: number;
  };
  if (!Array.isArray(rowData) || rowData.length === 0) {
    return res.status(400).json({ error: 'rows array required' });
  }

  const tenantId = tid(req);
  const defaultJobId = default_job_id ? Number(default_job_id) : null;
  if (defaultJobId && !(await assertJobInTenant(defaultJobId, tenantId))) {
    return res.status(400).json({ error: 'Invalid default job for this workspace' });
  }

  const [{ rows: existing }, { rows: jobs }] = await Promise.all([
    pool.query('SELECT email, phone FROM candidates WHERE tenant_id = $1', [tenantId]),
    pool.query('SELECT id, title FROM jobs WHERE tenant_id = $1', [tenantId]),
  ]);
  const emails = new Set(existing.map((r) => r.email?.toLowerCase()).filter(Boolean));
  const phones = new Set(existing.map((r) => r.phone?.replace(/\s/g, '')).filter(Boolean));

  const issues: {
    row: number;
    name?: string;
    phone?: string;
    issue: string;
    severity: 'error' | 'warning' | 'duplicate';
  }[] = [];
  let valid = 0;

  rowData.forEach((row, idx) => {
    const rowNum = idx + 2;
    const parsed = parseImportRow(row);

    if (!parsed.name) {
      issues.push({ row: rowNum, name: parsed.name, phone: parsed.phone, issue: 'Missing candidate name', severity: 'error' });
      return;
    }
    if (!parsed.phone) {
      issues.push({ row: rowNum, name: parsed.name, phone: parsed.phone, issue: 'Missing candidate phone', severity: 'error' });
      return;
    }
    const jobId = resolveJobId(jobs, parsed.job_title, defaultJobId);
    if (!jobId) {
      issues.push({
        row: rowNum,
        name: parsed.name,
        phone: parsed.phone,
        issue: parsed.job_title ? `Unknown job: ${parsed.job_title}` : 'Missing job title (or set default job)',
        severity: 'error',
      });
      return;
    }
    const normPhone = parsed.phone.replace(/\s/g, '');
    if (parsed.email && emails.has(parsed.email.toLowerCase())) {
      issues.push({ row: rowNum, name: parsed.name, phone: parsed.phone, issue: 'Duplicate email in database', severity: 'duplicate' });
      return;
    }
    if (normPhone && phones.has(normPhone)) {
      issues.push({ row: rowNum, name: parsed.name, phone: parsed.phone, issue: 'Duplicate phone in database', severity: 'duplicate' });
      return;
    }
    if (!/^\+?[\d\s-]{10,}$/.test(parsed.phone)) {
      issues.push({ row: rowNum, name: parsed.name, phone: parsed.phone, issue: 'Invalid phone format', severity: 'warning' });
    }
    if (parsed.experience_years < 0) {
      issues.push({ row: rowNum, name: parsed.name, phone: parsed.phone, issue: 'Invalid experience years', severity: 'warning' });
    }
    valid++;
    if (parsed.email) emails.add(parsed.email.toLowerCase());
    if (normPhone) phones.add(normPhone);
  });

  res.json({ valid, errors: issues.filter((i) => i.severity === 'error').length, warnings: issues.filter((i) => i.severity === 'warning').length, issues });
});

router.post('/import', async (req, res) => {
  const { rows: rowData, skip_errors, default_job_id } = req.body as {
    rows: Record<string, string>[];
    skip_errors?: boolean;
    default_job_id?: number;
  };
  if (!Array.isArray(rowData)) return res.status(400).json({ error: 'rows array required' });

  const tenantId = tid(req);
  const recruiterId = req.user!.id;
  const defaultJobId = default_job_id ? Number(default_job_id) : null;
  if (defaultJobId && !(await assertJobInTenant(defaultJobId, tenantId))) {
    return res.status(400).json({ error: 'Invalid default job for this workspace' });
  }

  const { rows: jobs } = await pool.query('SELECT id, title FROM jobs WHERE tenant_id = $1', [tenantId]);

  let imported = 0;
  let skipped = 0;

  for (const row of rowData) {
    const parsed = parseImportRow(row);
    if (!parsed.name || !parsed.phone) {
      skipped++;
      continue;
    }

    const jobId = resolveJobId(jobs, parsed.job_title, defaultJobId);
    if (!jobId) {
      if (skip_errors) {
        skipped++;
        continue;
      }
      return res.status(400).json({ error: `Row missing job: ${parsed.name}` });
    }

    const dup = await pool.query(
      'SELECT id FROM candidates WHERE tenant_id = $1 AND (email = $2 OR phone = $3) LIMIT 1',
      [tenantId, parsed.email || null, parsed.phone]
    );
    if (dup.rows[0]) {
      skipped++;
      continue;
    }

    const ai_score = computeAiScore(parsed.skills, parsed.experience_years);
    const createdAt = parsed.applied_at || new Date().toISOString();
    const { rows: inserted } = await pool.query(
      `INSERT INTO candidates (name, email, phone, skills, experience_years, ai_score, stage, job_id, recruiter_id, notes, salary_expectation, tenant_id, source, created_at, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10, $11, $12, 'import', $13, $13) RETURNING id`,
      [
        parsed.name,
        parsed.email || null,
        parsed.phone,
        JSON.stringify(parsed.skills),
        parsed.experience_years,
        ai_score,
        parsed.stage,
        jobId,
        recruiterId,
        parsed.notes || null,
        parsed.salary_expectation || null,
        tenantId,
        createdAt,
      ]
    );

    if (parsed.interview_at) {
      await pool.query(
        `INSERT INTO interviews (candidate_id, scheduled_at, duration_minutes, round_type, status)
         VALUES ($1, $2, 60, 'Screening', 'pending')`,
        [inserted[0].id, parsed.interview_at]
      );
      await promoteToInterviewStage(inserted[0].id, tenantId);
    }

    imported++;
  }

  res.json({ imported, skipped });
});

router.patch('/bulk', async (req, res) => {
  const { ids, stage, recruiter_id, offer_status } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids array required' });
  }
  if (!stage && recruiter_id === undefined && offer_status === undefined) {
    return res.status(400).json({ error: 'stage, offer_status or recruiter_id required' });
  }
  if (stage && !STAGES.includes(stage)) return res.status(400).json({ error: 'Invalid stage' });
  if (offer_status && !OFFER_STATUSES.includes(offer_status)) {
    return res.status(400).json({ error: 'Invalid offer_status' });
  }

  const updates: string[] = ['updated_at = NOW()'];
  const params: unknown[] = [];
  let i = 1;

  if (stage) {
    updates.push(`stage = $${i++}`);
    params.push(stage);
    if (stage === 'joined') {
      updates.push('joined_at = COALESCE(joined_at, NOW())');
      updates.push('offer_status = NULL');
    } else if (stage === 'selected' || stage === 'screening') {
      updates.push('offer_status = NULL');
    }
  }
  if (offer_status !== undefined) {
    updates.push(`offer_status = $${i++}`);
    params.push(offer_status);
  }
  if (recruiter_id !== undefined) {
    updates.push(`recruiter_id = $${i++}`);
    params.push(recruiter_id);
  }

  params.push(ids, tid(req));
  const { rowCount } = await pool.query(
    `UPDATE candidates SET ${updates.join(', ')} WHERE id = ANY($${i++}::int[]) AND tenant_id = $${i}`,
    params
  );

  for (const id of ids) {
    if (stage) {
      await pool.query(
        'INSERT INTO activities (type, description, user_id, candidate_id, tenant_id) VALUES ($1, $2, $3, $4, $5)',
        ['pipeline', `Bulk update to ${stage}`, req.user!.id, id, tid(req)]
      );
      if (stage === 'joined') {
        await onCandidateJoined(tid(req), id);
      }
    }
    if (offer_status) {
      await pool.query(
        'INSERT INTO activities (type, description, user_id, candidate_id, tenant_id) VALUES ($1, $2, $3, $4, $5)',
        ['pipeline', `Offer outcome: ${offer_status.replace(/_/g, ' ')}`, req.user!.id, id, tid(req)]
      );
      if (['offer_rejected', 'not_interested', 'joined_elsewhere'].includes(offer_status)) {
        await closeOpenFollowUps(tid(req), id, ['offer_followup', 'no_response'], 'auto_closed');
      }
      if (offer_status === 'left_company') {
        await closeOpenFollowUps(tid(req), id, ['onboarding'], 'auto_closed');
      }
    }
  }

  res.json({ updated: rowCount });
});

router.get('/:id/timeline', async (req, res) => {
  const candidateId = Number(req.params.id);
  if (!(await assertCandidateInTenant(candidateId, tid(req)))) {
    return res.status(404).json({ error: 'Candidate not found' });
  }

  const [activities, messages, interviews, followUps] = await Promise.all([
    pool.query(
      `SELECT a.id, a.type, a.description, a.created_at, 'activity' AS source, u.name AS actor_name
       FROM activities a
       LEFT JOIN users u ON u.id = a.user_id
       WHERE a.candidate_id = $1 AND a.tenant_id = $2
       ORDER BY a.created_at DESC`,
      [candidateId, tid(req)]
    ),
    pool.query(
      `SELECT m.id, m.sender, m.content, m.sent_at AS created_at, 'message' AS source,
              CASE WHEN m.is_outgoing THEN m.sender END AS actor_name,
              m.is_outgoing
       FROM messages m
       WHERE m.candidate_id = $1
       ORDER BY m.sent_at DESC`,
      [candidateId]
    ),
    pool.query(
      `SELECT i.id, i.round_type AS description, i.scheduled_at AS created_at, i.status, 'interview' AS source,
              u.name AS actor_name
       FROM interviews i
       LEFT JOIN users u ON u.id = i.created_by
       WHERE i.candidate_id = $1
       ORDER BY i.scheduled_at DESC`,
      [candidateId]
    ),
    pool.query(
      `SELECT f.id, f.type AS description, f.due_at AS created_at, f.status, 'follow_up' AS source,
              u.name AS actor_name
       FROM follow_ups f
       LEFT JOIN users u ON u.id = f.assigned_to
       WHERE f.candidate_id = $1 AND f.tenant_id = $2
       ORDER BY f.due_at DESC`,
      [candidateId, tid(req)]
    ),
  ]);

  const timeline = [
    ...activities.rows,
    ...messages.rows,
    ...interviews.rows,
    ...followUps.rows,
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  res.json(timeline);
});

router.get('/:id/suggestions', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM candidates WHERE id = $1 AND tenant_id = $2', [
    req.params.id,
    tid(req),
  ]);
  const c = rows[0];
  if (!c) return res.status(404).json({ error: 'Candidate not found' });

  const suggestions = [
    `Hi ${c.name.split(' ')[0]}, quick follow-up on your application. Any questions?`,
    `Would Tuesday 2 PM work for a quick call?`,
    `I'll share the interview link shortly.`,
  ];
  if (c.salary_expectation) {
    suggestions.push(`Based on profile, salary range looks like ${c.salary_expectation}.`);
  }
  res.json({ suggestions, ai_score: c.ai_score, salary_expectation: c.salary_expectation });
});

router.put('/:id/screening', async (req, res) => {
  const candidateId = Number(req.params.id);
  const { rows: existing } = await pool.query(
    'SELECT id, name FROM candidates WHERE id = $1 AND tenant_id = $2',
    [candidateId, tid(req)]
  );
  if (!existing[0]) return res.status(404).json({ error: 'Candidate not found' });

  const scores: Record<string, number | null> = {};
  for (const field of [...SCREENING_QUESTION_FIELDS, ...RED_FLAG_FIELDS]) {
    const value = req.body[field];
    if (value === undefined || value === null) {
      scores[field] = null;
      continue;
    }
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1 || n > 5) {
      return res.status(400).json({ error: `${field} must be a score from 1 to 5` });
    }
    scores[field] = n;
  }

  // Unscored questions count as 0, matching the spreadsheet formula the risk
  // levels come from: >=20 join, >=15 moderate, else ghosting risk.
  const totalScore = SCREENING_QUESTION_FIELDS.reduce((sum, f) => sum + (scores[f] ?? 0), 0);
  const totalRedFlags = RED_FLAG_FIELDS.reduce((sum, f) => sum + (scores[f] ?? 0), 0);
  const screening = {
    ...scores,
    total_score: totalScore,
    total_red_flags: totalRedFlags,
    risk_level: screeningRiskLevel(totalScore),
    updated_by: req.user!.id,
    updated_at: new Date().toISOString(),
  };

  const { rows } = await pool.query(
    'UPDATE candidates SET screening = $1::jsonb, updated_at = NOW() WHERE id = $2 AND tenant_id = $3 RETURNING *',
    [JSON.stringify(screening), candidateId, tid(req)]
  );

  await pool.query(
    'INSERT INTO activities (type, description, user_id, candidate_id, tenant_id) VALUES ($1, $2, $3, $4, $5)',
    [
      'screening',
      `${existing[0].name} pre-screening scored ${totalScore}/25 — ${screening.risk_level}`,
      req.user!.id,
      candidateId,
      tid(req),
    ]
  );

  res.json(rows[0]);
});

router.get('/:id', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT c.*, j.title AS job_title, j.client, j.location, u.name AS recruiter_name
     FROM candidates c
     LEFT JOIN jobs j ON c.job_id = j.id AND j.tenant_id = c.tenant_id
     LEFT JOIN users u ON c.recruiter_id = u.id AND u.tenant_id = c.tenant_id
     WHERE c.id = $1 AND c.tenant_id = $2`,
    [req.params.id, tid(req)]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Candidate not found' });
  res.json(rows[0]);
});

router.post('/', async (req, res) => {
  const { name, email, phone, skills, experience_years, job_id, recruiter_id, notes, salary_expectation } =
    req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });

  if (job_id && !(await assertJobInTenant(Number(job_id), tid(req)))) {
    return res.status(400).json({ error: 'Invalid job for this workspace' });
  }

  const ai_score = computeAiScore(skills || [], experience_years || 0);
  const { rows } = await pool.query(
    `INSERT INTO candidates (name, email, phone, skills, experience_years, ai_score, job_id, recruiter_id, notes, salary_expectation, tenant_id)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
    [
      name,
      email || null,
      phone || null,
      JSON.stringify(skills || []),
      experience_years || 0,
      ai_score,
      job_id || null,
      recruiter_id || req.user!.id,
      notes || null,
      salary_expectation || null,
      tid(req),
    ]
  );

  await pool.query(
    'INSERT INTO activities (type, description, user_id, candidate_id, tenant_id) VALUES ($1, $2, $3, $4, $5)',
    ['pipeline', `${name} added to pipeline`, req.user!.id, rows[0].id, tid(req)]
  );

  res.status(201).json(rows[0]);
});

router.patch('/:id', async (req, res) => {
  const { stage, notes, skills, experience_years, salary_expectation, recruiter_id, job_id, offer_status, is_hot, expected_joining_at } = req.body;

  const { rows: existing } = await pool.query(
    'SELECT id, name FROM candidates WHERE id = $1 AND tenant_id = $2',
    [req.params.id, tid(req)]
  );
  if (!existing[0]) return res.status(404).json({ error: 'Candidate not found' });

  const updates: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  if (stage !== undefined) {
    if (!STAGES.includes(stage)) return res.status(400).json({ error: 'Invalid stage' });
    updates.push(`stage = $${i++}`);
    params.push(stage);
    // Follow-up engine lifecycle hooks
    if (stage === 'joined') {
      updates.push('joined_at = COALESCE(joined_at, NOW())');
      updates.push('offer_status = NULL');
    } else if (stage === 'selected' || stage === 'screening') {
      updates.push('offer_status = NULL');
    }
  }
  if (offer_status !== undefined) {
    if (offer_status !== null && !OFFER_STATUSES.includes(offer_status)) {
      return res.status(400).json({ error: 'Invalid offer_status' });
    }
    updates.push(`offer_status = $${i++}`);
    params.push(offer_status);
  }
  if (notes !== undefined) {
    updates.push(`notes = $${i++}`);
    params.push(notes);
  }
  if (skills !== undefined) {
    updates.push(`skills = $${i++}::jsonb`);
    params.push(JSON.stringify(skills));
    updates.push(`ai_score = $${i++}`);
    params.push(computeAiScore(skills, experience_years || 0));
  }
  if (experience_years !== undefined) {
    updates.push(`experience_years = $${i++}`);
    params.push(experience_years);
  }
  if (salary_expectation !== undefined) {
    updates.push(`salary_expectation = $${i++}`);
    params.push(salary_expectation);
  }
  if (recruiter_id !== undefined) {
    updates.push(`recruiter_id = $${i++}`);
    params.push(recruiter_id);
  }
  if (is_hot !== undefined) {
    updates.push(`is_hot = $${i++}`);
    params.push(Boolean(is_hot));
  }
  if (job_id !== undefined) {
    if (job_id && !(await assertJobInTenant(Number(job_id), tid(req)))) {
      return res.status(400).json({ error: 'Invalid job for this workspace' });
    }
    updates.push(`job_id = $${i++}`);
    params.push(job_id);
  }
  if (expected_joining_at !== undefined) {
    if (expected_joining_at !== null && Number.isNaN(Date.parse(expected_joining_at))) {
      return res.status(400).json({ error: 'Invalid expected_joining_at' });
    }
    updates.push(`expected_joining_at = $${i++}`);
    params.push(expected_joining_at);
  }

  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

  updates.push('updated_at = NOW()');
  const idParam = i;
  const tenantParam = i + 1;
  params.push(req.params.id, tid(req));

  const { rows } = await pool.query(
    `UPDATE candidates SET ${updates.join(', ')} WHERE id = $${idParam} AND tenant_id = $${tenantParam} RETURNING *`,
    params
  );

  if (stage) {
    await pool.query(
      'INSERT INTO activities (type, description, user_id, candidate_id, tenant_id) VALUES ($1, $2, $3, $4, $5)',
      ['pipeline', `${rows[0].name} moved to ${stage}`, req.user!.id, rows[0].id, tid(req)]
    );
    if (stage === 'joined') {
      await onCandidateJoined(tid(req), rows[0].id);
    }
  }
  if (expected_joining_at !== undefined) {
    // Drop pending joining-date milestones so the follow-up engine regenerates
    // them from the new date on the next sync.
    await pool.query(
      `DELETE FROM follow_ups
       WHERE tenant_id = $1 AND candidate_id = $2 AND category = 'offer_followup'
         AND milestone_day IS NOT NULL AND completed_at IS NULL AND status NOT IN ('completed', 'missed')`,
      [tid(req), rows[0].id]
    );
    await pool.query(
      'INSERT INTO activities (type, description, user_id, candidate_id, tenant_id) VALUES ($1, $2, $3, $4, $5)',
      [
        'pipeline',
        expected_joining_at
          ? `${rows[0].name} — expected joining date set to ${new Date(expected_joining_at).toLocaleDateString()}`
          : `${rows[0].name} — expected joining date cleared`,
        req.user!.id,
        rows[0].id,
        tid(req),
      ]
    );
  }
  if (is_hot !== undefined) {
    await pool.query(
      'INSERT INTO activities (type, description, user_id, candidate_id, tenant_id) VALUES ($1, $2, $3, $4, $5)',
      [
        'hot_candidate',
        is_hot ? `${rows[0].name} marked as hot candidate 🔥` : `${rows[0].name} unmarked as hot candidate`,
        req.user!.id,
        rows[0].id,
        tid(req),
      ]
    );
  }
  if (offer_status) {
    await pool.query(
      'INSERT INTO activities (type, description, user_id, candidate_id, tenant_id) VALUES ($1, $2, $3, $4, $5)',
      ['pipeline', `${rows[0].name} — offer outcome: ${offer_status.replace(/_/g, ' ')}`, req.user!.id, rows[0].id, tid(req)]
    );
    if (['offer_rejected', 'not_interested', 'joined_elsewhere'].includes(offer_status)) {
      await closeOpenFollowUps(tid(req), rows[0].id, ['offer_followup', 'no_response'], 'auto_closed');
    }
    if (offer_status === 'left_company') {
      await closeOpenFollowUps(tid(req), rows[0].id, ['onboarding'], 'auto_closed');
    }
  }

  res.json(rows[0]);
});

router.delete('/:id', async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM candidates WHERE id = $1 AND tenant_id = $2', [
    req.params.id,
    tid(req),
  ]);
  if (!rowCount) return res.status(404).json({ error: 'Candidate not found' });
  res.status(204).send();
});

function parseImportRow(row: Record<string, string>) {
  const name = (
    row.candidateName ||
    row.candidatename ||
    row.name ||
    row.full_name ||
    ''
  ).trim();
  const phone = (
    row.candidatePhone ||
    row.candidatephone ||
    row.phone ||
    row.mobile ||
    ''
  ).trim();
  const email = (
    row.candidateEmail ||
    row.candidateemail ||
    row.email ||
    row.email_id ||
    ''
  ).trim();
  const job_title = (row.jobTitle || row.job_title || row.job || row.position || '').trim();
  const companyName = (row.companyName || row.companyname || '').trim();
  const location = (row.location || '').trim();
  const currentStatus = (row.currentStatus || row.currentstatus || '').trim();
  const sourcedBy = (row.sourcedBy || row.sourcedby || '').trim();
  const sourcedByPhone = (row.sourcedByPhone || row.sourcedbyphone || '').trim();
  const lvl1Name = (row.lvl1managerName || row.lvl1manager || '').trim();
  const lvl1Phone = (row.lvl1managerPhone || '').trim();
  const lvl2Name = (row.lvl2managerName || row.lvl2manager || '').trim();
  const lvl2Phone = (row.lvl2managerPhone || '').trim();
  const appliedOn = (row.appliedOn || row.appliedon || '').trim();
  const interviewDate = (row.interviewDate || row.interviewdate || '').trim();

  const expRaw = (row.experience_years || row.experience || row.exp || '0').trim();
  const experience_years = parseFloat(expRaw) || 0;
  const skillsRaw = (row.skills || row.skill || '').trim();
  const skills = skillsRaw
    ? skillsRaw.split(/[,;|]/).map((s) => s.trim()).filter(Boolean)
    : [];
  const salary_expectation = (row.salary_expectation || row.salary || row.expected_salary || '').trim();

  const noteLines: string[] = [];
  if (companyName) noteLines.push(`Company: ${companyName}`);
  if (location) noteLines.push(`Location: ${location}`);
  if (currentStatus) noteLines.push(`Status: ${currentStatus}`);
  if (sourcedBy) {
    noteLines.push(`Sourced by: ${sourcedBy}${sourcedByPhone ? ` (${sourcedByPhone})` : ''}`);
  }
  if (lvl1Name) {
    noteLines.push(`L1 Manager: ${lvl1Name}${lvl1Phone ? ` (${lvl1Phone})` : ''}`);
  }
  if (lvl2Name) {
    noteLines.push(`L2 Manager: ${lvl2Name}${lvl2Phone ? ` (${lvl2Phone})` : ''}`);
  }
  if (appliedOn) noteLines.push(`Applied on: ${appliedOn}`);
  const explicitNotes = (row.notes || row.note || '').trim();
  const notes = noteLines.length ? noteLines.join('\n') : explicitNotes;

  return {
    name,
    phone,
    email,
    job_title,
    experience_years,
    skills,
    notes,
    salary_expectation,
    stage: mapImportStatusToStage(currentStatus),
    interview_at: parseImportDate(interviewDate),
    applied_at: parseImportDate(appliedOn),
  };
}

function mapImportStatusToStage(status: string): string {
  const s = status.toLowerCase();
  if (s.includes('interview')) return 'interview';
  if (s.includes('screen')) return 'screening';
  if (s.includes('select')) return 'selected';
  if (s.includes('reject')) return 'rejected';
  if (s.includes('join')) return 'joined';
  return 'applied';
}

function parseImportDate(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function resolveJobId(
  jobs: { id: number; title: string }[],
  jobTitle: string,
  defaultJobId: number | null
): number | null {
  if (jobTitle) {
    const lower = jobTitle.toLowerCase();
    const exact = jobs.find((j) => j.title.toLowerCase() === lower);
    if (exact) return exact.id;
    const partial = jobs.find(
      (j) =>
        j.title.toLowerCase().includes(lower) || lower.includes(j.title.toLowerCase())
    );
    if (partial) return partial.id;
  }
  return defaultJobId;
}

function computeAiScore(skills: string[], years: number): number {
  const base = Math.min(10, 5 + years * 0.4 + skills.length * 0.3);
  return Math.round(base * 10) / 10;
}

export default router;
