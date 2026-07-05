import { Router, type Request } from 'express';
import { pool } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import {
  assertCandidateInTenant,
  requireTenant,
  tenantClause,
  tenantMiddleware,
} from '../middleware/tenant.js';

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

router.get('/:candidateId/suggestions', async (req, res) => {
  if (!(await assertCandidateInTenant(Number(req.params.candidateId), tid(req)))) {
    return res.status(404).json({ error: 'Candidate not found' });
  }

  const { rows } = await pool.query(
    `SELECT m.content, m.is_outgoing FROM messages m
     WHERE m.candidate_id = $1 ORDER BY m.sent_at DESC LIMIT 5`,
    [req.params.candidateId]
  );

  const lastIncoming = rows.find((m) => !m.is_outgoing)?.content || '';
  const suggestions = [
    'Thanks for reaching out! Let me check and get back to you shortly.',
    'Would a call tomorrow at 2 PM work for you?',
    'I have shared the job description. Please review and confirm your interest.',
  ];
  if (lastIncoming.toLowerCase().includes('interview')) {
    suggestions.unshift('Great! I can schedule the interview this week. Which day works best?');
  }
  if (lastIncoming.toLowerCase().includes('job description')) {
    suggestions.unshift('Sure! I will send the JD right away. The role offers competitive compensation.');
  }

  res.json({ suggestions: suggestions.slice(0, 3) });
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

  const { rows } = await pool.query(
    `INSERT INTO messages (candidate_id, sender, content, is_outgoing)
     VALUES ($1, $2, $3, TRUE) RETURNING *`,
    [candidateId, req.user!.name, content.trim()]
  );

  await pool.query(
    'INSERT INTO activities (type, description, user_id, candidate_id, tenant_id) VALUES ($1, $2, $3, $4, $5)',
    ['message', `${req.user!.name} sent WhatsApp message`, req.user!.id, candidateId, tid(req)]
  );

  res.status(201).json(rows[0]);
});

export default router;
