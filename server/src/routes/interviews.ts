import { Router, type Request } from 'express';
import { pool } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import {
  assertCandidateInTenant,
  requireTenant,
  tenantClause,
  tenantMiddleware,
} from '../middleware/tenant.js';
import { promoteToInterviewStage } from '../services/candidateStage.js';
import { storeAndSendCandidateWhatsApp } from '../services/candidateMessaging.js';
import { interviewScheduledMessage } from '../services/messageTemplates.js';
import { aiMode, generateInterviewScheduledMessage } from '../services/ai.js';
import {
  appPublicUrl,
  candidateJoinPath,
  createLiveKitToken,
  extractJoinToken,
  generateJoinCode,
  interviewRoomName,
  isLiveKitConfigured,
  liveKitServerUrl,
  normalizeMeetingLink,
} from '../services/livekit.js';
import { getScreeningQuestionsForInterview } from '../services/screeningQuestions.js';

const router = Router();
router.use(authMiddleware);
router.use(tenantMiddleware);
router.use(requireTenant);

const tid = (req: Request) => req.tenant!.id;

function interviewAccessSql(req: Request, t: ReturnType<typeof tenantClause>, idx: number) {
  let sql = '';
  const params: unknown[] = [];
  if (req.user!.role === 'recruiter') {
    sql += ` AND c.recruiter_id = $${idx}`;
    params.push(req.user!.id);
  } else if (req.user!.role === 'hiring_manager') {
    sql += ` AND c.recruiter_id IN (
      SELECT r.id FROM users r WHERE r.tenant_id = $${idx} AND r.role = 'recruiter'
      AND (r.managed_by_id = $${idx + 1} OR r.company_id = (SELECT company_id FROM users WHERE id = $${idx + 1}))
    )`;
    params.push(tid(req), req.user!.id);
  }
  return { sql, params };
}

async function fetchInterviewForTenant(req: Request, interviewId: number) {
  const t = tenantClause(tid(req), 'c', 1);
  let sql = `
    SELECT i.*, c.name AS candidate_name, c.email AS candidate_email
    FROM interviews i
    JOIN candidates c ON i.candidate_id = c.id
    WHERE i.id = $${t.nextIndex} AND ${t.sql}
  `;
  const params: unknown[] = [t.param, interviewId];
  const access = interviewAccessSql(req, t, t.nextIndex + 1);
  sql += access.sql;
  params.push(...access.params);
  const { rows } = await pool.query(sql, params);
  return rows[0] ?? null;
}

type InterviewRow = Record<string, unknown> & { id: number; meeting_link?: string | null };

async function withNormalizedMeetingLinks(req: Request, rows: InterviewRow[]): Promise<InterviewRow[]> {
  const base = appPublicUrl(req);
  const updates: { id: number; link: string }[] = [];

  for (const row of rows) {
    const normalized = normalizeMeetingLink(row.meeting_link, base);
    if (normalized && normalized !== row.meeting_link) {
      row.meeting_link = normalized;
      updates.push({ id: row.id, link: normalized });
    }
  }

  for (const { id, link } of updates) {
    await pool.query('UPDATE interviews SET meeting_link = $1 WHERE id = $2', [link, id]);
  }

  return rows;
}

router.get('/', async (req, res) => {
  const { date, candidate_id } = req.query;
  const t = tenantClause(tid(req), 'c', 1);
  let sql = `
    SELECT i.*, c.name AS candidate_name, c.email AS candidate_email
    FROM interviews i
    JOIN candidates c ON i.candidate_id = c.id
    WHERE ${t.sql}
  `;
  const params: unknown[] = [t.param];
  let idx = t.nextIndex;

  if (req.user!.role === 'recruiter') {
    sql += ` AND c.recruiter_id = $${idx++}`;
    params.push(req.user!.id);
  } else if (req.user!.role === 'hiring_manager') {
    sql += ` AND c.recruiter_id IN (
      SELECT r.id FROM users r WHERE r.tenant_id = $${idx} AND r.role = 'recruiter'
      AND (r.managed_by_id = $${idx + 1} OR r.company_id = (SELECT company_id FROM users WHERE id = $${idx + 1}))
    )`;
    params.push(tid(req), req.user!.id);
    idx += 2;
  }

  if (candidate_id) {
    sql += ` AND i.candidate_id = $${idx++}`;
    params.push(Number(candidate_id));
  }
  if (date) {
    sql += ` AND i.scheduled_at::date = $${idx++}::date`;
    params.push(date);
  }
  sql += ' ORDER BY i.scheduled_at ASC';

  const { rows } = await pool.query(sql, params);
  res.json(await withNormalizedMeetingLinks(req, rows));
});

router.get('/:id', async (req, res) => {
  const interviewId = Number(req.params.id);
  if (!Number.isFinite(interviewId)) return res.status(400).json({ error: 'Invalid interview id' });
  const row = await fetchInterviewForTenant(req, interviewId);
  if (!row) return res.status(404).json({ error: 'Interview not found' });
  const [normalized] = await withNormalizedMeetingLinks(req, [row]);
  res.json(normalized);
});

router.get('/:id/screening-questions', async (req, res) => {
  const interviewId = Number(req.params.id);
  if (!Number.isFinite(interviewId)) return res.status(400).json({ error: 'Invalid interview id' });

  const existing = await fetchInterviewForTenant(req, interviewId);
  if (!existing) return res.status(404).json({ error: 'Interview not found' });

  try {
    const result = await getScreeningQuestionsForInterview(interviewId, tid(req));
    res.json(result);
  } catch {
    return res.status(404).json({ error: 'Interview not found' });
  }
});

router.put('/:id/evaluation', asyncHandler(async (req, res) => {
  const interviewId = Number(req.params.id);
  if (!Number.isFinite(interviewId)) return res.status(400).json({ error: 'Invalid interview id' });

  const existing = await fetchInterviewForTenant(req, interviewId);
  if (!existing) return res.status(404).json({ error: 'Interview not found' });

  const { questions } = await getScreeningQuestionsForInterview(interviewId, tid(req));
  const questionFields = questions.interview.map((q) => q.id);

  const scores: Record<string, number | null> = {};
  for (const f of questionFields) {
    const v = req.body[f];
    if (v === null || v === undefined || v === '') {
      scores[f] = null;
    } else {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 1 || n > 5) {
        return res.status(400).json({ error: `Invalid score for ${f}: must be 1–5` });
      }
      scores[f] = n;
    }
  }

  const scored = questionFields.filter((f) => scores[f] != null);
  const totalScore = scored.reduce((sum, f) => sum + (scores[f] ?? 0), 0);
  const maxScore = questionFields.length * 5;
  const overallScore = scored.length > 0 ? Math.round((totalScore / maxScore) * 100) / 10 : null;

  const evaluation = {
    ...scores,
    total_score: totalScore,
    questions_scored: scored.length,
    max_score: maxScore,
    overall_score: overallScore,
    notes: typeof req.body.notes === 'string' ? req.body.notes : existing.evaluation?.notes ?? null,
    updated_by: req.user!.id,
    updated_at: new Date().toISOString(),
  };

  const { rows } = await pool.query(
    `UPDATE interviews i SET evaluation = $1::jsonb, score = $2::double precision, status = CASE WHEN $2::double precision IS NOT NULL THEN 'completed' ELSE i.status END
     FROM candidates c
     WHERE i.id = $3 AND i.candidate_id = c.id AND c.tenant_id = $4
     RETURNING i.*, c.name AS candidate_name`,
    [evaluation, overallScore, interviewId, tid(req)]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Interview not found' });

  await pool.query(
    'INSERT INTO activities (type, description, user_id, candidate_id, tenant_id) VALUES ($1, $2, $3, $4, $5)',
    [
      'interview',
      `${existing.candidate_name} interview screened ${totalScore}/${maxScore}${overallScore != null ? ` — ${overallScore}/10` : ''}`,
      req.user!.id,
      existing.candidate_id,
      tid(req),
    ]
  );

  res.json({ ...rows[0], evaluation, candidate_name: rows[0].candidate_name ?? existing.candidate_name });
}));

router.post('/', async (req, res) => {
  const { candidate_id, scheduled_at, duration_minutes, round_type, status, meeting_link, notes } =
    req.body;
  if (!candidate_id || !scheduled_at) {
    return res.status(400).json({ error: 'candidate_id and scheduled_at required' });
  }

  if (!(await assertCandidateInTenant(Number(candidate_id), tid(req)))) {
    return res.status(404).json({ error: 'Candidate not found' });
  }

  const duration = duration_minutes || 60;
  const { rows } = await pool.query(
    `INSERT INTO interviews (candidate_id, scheduled_at, duration_minutes, round_type, status, meeting_link, notes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [
      candidate_id,
      scheduled_at,
      duration,
      round_type || 'Technical',
      status || 'pending',
      meeting_link || null,
      notes || null,
      req.user!.id,
    ]
  );

  const interview = rows[0];
  if (!meeting_link) {
    const joinCode = generateJoinCode();
    const link = candidateJoinPath(joinCode, appPublicUrl(req));
    const { rows: updated } = await pool.query(
      'UPDATE interviews SET meeting_link = $1, join_code = $2 WHERE id = $3 RETURNING *',
      [link, joinCode, interview.id]
    );
    Object.assign(interview, updated[0]);
  } else {
    const token = extractJoinToken(meeting_link);
    if (token && !token.includes('.')) {
      const { rows: updated } = await pool.query(
        'UPDATE interviews SET join_code = $1 WHERE id = $2 RETURNING *',
        [token, interview.id]
      );
      Object.assign(interview, updated[0]);
    }
  }

  await pool.query(
    'INSERT INTO activities (type, description, user_id, candidate_id, tenant_id) VALUES ($1, $2, $3, $4, $5)',
    ['interview', `Interview scheduled for candidate #${candidate_id}`, req.user!.id, candidate_id, tid(req)]
  );

  await promoteToInterviewStage(Number(candidate_id), tid(req));

  const { rows: candidateRows } = await pool.query(
    `SELECT c.name, c.phone, j.title AS job_title
     FROM candidates c
     LEFT JOIN jobs j ON j.id = c.job_id
     WHERE c.id = $1`,
    [candidate_id]
  );
  const candidate = candidateRows[0];
  let whatsapp: { status: 'simulated' | 'sent' | 'failed'; error?: string } | undefined;

  if (candidate && interview.meeting_link) {
    let body: string | null = null;
    if (aiMode() === 'live') {
      body = await generateInterviewScheduledMessage({
        candidateName: candidate.name,
        jobTitle: candidate.job_title,
        interviewAt: scheduled_at,
        meetingLink: interview.meeting_link,
      });
    }
    if (!body) {
      body = interviewScheduledMessage(
        candidate.name,
        candidate.job_title,
        new Date(scheduled_at),
        interview.meeting_link
      );
    }
    const result = await storeAndSendCandidateWhatsApp({
      candidateId: Number(candidate_id),
      tenantId: tid(req),
      userId: req.user!.id,
      senderName: req.user!.name,
      content: body,
    });
    whatsapp = { status: result.waStatus, error: result.wa.error };
  }

  res.status(201).json({ ...(await withNormalizedMeetingLinks(req, [interview]))[0], whatsapp });
});

router.get('/:id/video-token', async (req, res) => {
  if (!isLiveKitConfigured()) {
    return res.status(503).json({
      error: 'Video calling is not configured. Set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET.',
    });
  }

  const interviewId = Number(req.params.id);
  if (!Number.isFinite(interviewId)) return res.status(400).json({ error: 'Invalid interview id' });

  const iv = await fetchInterviewForTenant(req, interviewId);
  if (!iv) return res.status(404).json({ error: 'Interview not found' });

  const [normalizedIv] = await withNormalizedMeetingLinks(req, [iv]);

  const roomName = interviewRoomName(normalizedIv.id);
  const displayName = req.user!.name || req.user!.email;
  const identity = `staff-${req.user!.id}`;
  const token = await createLiveKitToken(roomName, identity, displayName);

  res.json({
    serverUrl: liveKitServerUrl(),
    token,
    roomName,
    participantName: displayName,
    interview: {
      id: normalizedIv.id,
      candidateName: normalizedIv.candidate_name,
      scheduledAt: normalizedIv.scheduled_at,
      roundType: normalizedIv.round_type,
      meetingLink: normalizedIv.meeting_link,
      evaluation: normalizedIv.evaluation ?? null,
    },
  });
});

router.patch('/:id', async (req, res) => {
  const fields = ['scheduled_at', 'duration_minutes', 'round_type', 'status', 'meeting_link', 'notes', 'score'] as const;
  const updates: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  for (const f of fields) {
    if (req.body[f] !== undefined) {
      updates.push(`${f} = $${i++}`);
      params.push(req.body[f]);
    }
  }
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

  const idParam = i;
  const tenantParam = i + 1;
  params.push(req.params.id, tid(req));

  const { rows } = await pool.query(
    `UPDATE interviews i SET ${updates.join(', ')}
     FROM candidates c
     WHERE i.id = $${idParam} AND i.candidate_id = c.id AND c.tenant_id = $${tenantParam}
     RETURNING i.*`,
    params
  );
  if (!rows[0]) return res.status(404).json({ error: 'Interview not found' });
  const [normalized] = await withNormalizedMeetingLinks(req, rows);
  res.json(normalized);
});

router.delete('/:id', async (req, res) => {
  const { rowCount } = await pool.query(
    `DELETE FROM interviews i USING candidates c
     WHERE i.id = $1 AND i.candidate_id = c.id AND c.tenant_id = $2`,
    [req.params.id, tid(req)]
  );
  if (!rowCount) return res.status(404).json({ error: 'Interview not found' });
  res.status(204).send();
});

export default router;
