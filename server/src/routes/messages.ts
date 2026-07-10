import { Router, type Request } from 'express';
import { pool } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import {
  assertCandidateInTenant,
  requireTenant,
  tenantClause,
  tenantMiddleware,
} from '../middleware/tenant.js';
import {
  whatsappIntegrationStatus,
} from '../services/whatsapp.js';
import { interviewScheduledMessage } from '../services/messageTemplates.js';
import { storeAndSendCandidateWhatsApp } from '../services/candidateMessaging.js';
import { aiMode, suggestMessages } from '../services/ai.js';

const router = Router();
router.use(authMiddleware);
router.use(tenantMiddleware);
router.use(requireTenant);

const tid = (req: Request) => req.tenant!.id;

router.get('/conversations', async (req, res) => {
  const t = tenantClause(tid(req), 'c', 1);
  const { rows } = await pool.query(
    `SELECT c.id, c.name, c.phone, c.stage,
      (SELECT content FROM messages m WHERE m.candidate_id = c.id ORDER BY m.sent_at DESC LIMIT 1) AS last_message,
      (SELECT sent_at FROM messages m WHERE m.candidate_id = c.id ORDER BY m.sent_at DESC LIMIT 1) AS last_message_at,
      (SELECT COUNT(*)::int FROM messages m WHERE m.candidate_id = c.id AND m.is_outgoing = FALSE
        AND m.sent_at > NOW() - INTERVAL '7 days') AS unread_hint
    FROM candidates c
    WHERE ${t.sql} AND EXISTS (SELECT 1 FROM messages m WHERE m.candidate_id = c.id)
    ORDER BY last_message_at DESC NULLS LAST`,
    [t.param]
  );
  res.json(rows);
});

router.get('/status/integration', (_req, res) => {
  res.json({ ...whatsappIntegrationStatus(), ai: aiMode() });
});

router.get('/:candidateId/suggestions', async (req, res) => {
  if (!(await assertCandidateInTenant(Number(req.params.candidateId), tid(req)))) {
    return res.status(404).json({ error: 'Candidate not found' });
  }

  const { rows } = await pool.query(
    `SELECT m.content, m.is_outgoing FROM messages m
     WHERE m.candidate_id = $1 ORDER BY m.sent_at DESC LIMIT 10`,
    [req.params.candidateId]
  );

  const { rows: upcoming } = await pool.query(
    `SELECT i.scheduled_at, i.meeting_link, c.name, c.stage, c.salary_expectation, j.title, j.location
     FROM candidates c
     LEFT JOIN interviews i ON i.candidate_id = c.id
       AND i.status IN ('pending', 'confirmed') AND i.scheduled_at > NOW()
     LEFT JOIN jobs j ON j.id = c.job_id
     WHERE c.id = $1
     ORDER BY i.scheduled_at ASC NULLS LAST LIMIT 1`,
    [req.params.candidateId]
  );
  const c = upcoming[0];

  // The interview confirmation template stays first when an interview is
  // pending — the webhook's "CONFIRMED" reply parsing depends on its wording.
  const confirmationFirst = c?.scheduled_at
    ? [interviewScheduledMessage(c.name, c.title, new Date(c.scheduled_at), c.meeting_link)]
    : [];

  if (aiMode() === 'live' && c) {
    const ai = await suggestMessages({
      candidateName: c.name,
      stage: c.stage,
      jobTitle: c.title,
      jobLocation: c.location,
      salaryExpectation: c.salary_expectation,
      upcomingInterviewAt: c.scheduled_at,
      recentMessages: rows
        .slice()
        .reverse()
        .map((m) => ({
          direction: m.is_outgoing ? ('recruiter' as const) : ('candidate' as const),
          content: m.content,
        })),
      purpose: 'whatsapp_reply',
    });
    if (ai) {
      return res.json({ suggestions: [...confirmationFirst, ...ai].slice(0, 3), source: 'ai' });
    }
  }

  // Fallback: canned suggestions (AI disabled or the call failed).
  const lastIncoming = rows.find((m) => !m.is_outgoing)?.content || '';
  const suggestions = [
    'Thanks for reaching out! Let me check and get back to you shortly.',
    'Would a call tomorrow at 2 PM work for you?',
    'I have shared the job description. Please review and confirm your interest.',
  ];
  suggestions.unshift(...confirmationFirst);
  if (lastIncoming.toLowerCase().includes('interview')) {
    suggestions.unshift('Great! I can schedule the interview this week. Which day works best?');
  }
  if (lastIncoming.toLowerCase().includes('job description')) {
    suggestions.unshift('Sure! I will send the JD right away. The role offers competitive compensation.');
  }

  res.json({ suggestions: suggestions.slice(0, 3), source: 'template' });
});

router.get('/:candidateId', async (req, res) => {
  if (!(await assertCandidateInTenant(Number(req.params.candidateId), tid(req)))) {
    return res.status(404).json({ error: 'Candidate not found' });
  }

  const { rows } = await pool.query(
    'SELECT * FROM messages WHERE candidate_id = $1 ORDER BY sent_at ASC',
    [req.params.candidateId]
  );
  res.json(rows);
});

router.post('/:candidateId', async (req, res) => {
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'Message content required' });

  const candidateId = Number(req.params.candidateId);
  if (!(await assertCandidateInTenant(candidateId, tid(req)))) {
    return res.status(404).json({ error: 'Candidate not found' });
  }

  const { message, waStatus, wa } = await storeAndSendCandidateWhatsApp({
    candidateId,
    tenantId: tid(req),
    userId: req.user!.id,
    senderName: req.user!.name,
    content: content.trim(),
  });

  res.status(201).json({ ...message, wa_status: waStatus, wa_error: wa.error });
});

export default router;
