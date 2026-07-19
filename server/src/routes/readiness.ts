import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { pool } from '../db.js';

/**
 * Public, unauthenticated AI Hiring Readiness self-assessment (lead capture).
 *
 *   POST /api/readiness   { org_name, contact_name?, email?, phone?, answers }
 *
 * Mirrors docs/HarmiRecruit_AI_Hiring_Readiness_Scorecard.pdf: 8 parameters
 * scored 1–5, total /40 → tier. The score is recomputed server-side; the
 * stored row is a sales lead, never exposed back through a public endpoint.
 */

const router = Router();

const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many submissions from this network. Try again later.' },
});

export const READINESS_QUESTIONS = [
  { key: 'data_hygiene', dimension: 'Data hygiene', module: 'AI Resume Parser + Careers apply' },
  { key: 'channel_discipline', dimension: 'Channel discipline', module: 'WhatsApp inbox (Meta API)' },
  { key: 'screening_consistency', dimension: 'Screening consistency', module: 'AI Match Score /10' },
  { key: 'hm_collaboration', dimension: 'HM collaboration', module: 'HM dashboard + scorecards' },
  { key: 'followup_ownership', dimension: 'Follow-up ownership', module: 'Follow-up engine + AI scripts' },
  { key: 'ai_trust', dimension: 'AI trust', module: 'AI drafts — WhatsApp replies, JDs, screening Qs' },
  { key: 'measurement', dimension: 'Measurement', module: 'Analytics + recruiter leaderboard' },
  { key: 'scale_pressure', dimension: 'Scale pressure', module: 'AI layer across every seat' },
] as const;

export function readinessTier(total: number): { tier: string; label: string } {
  if (total <= 18) return { tier: 'manual', label: 'Manual' };
  if (total <= 28) return { tier: 'tool_ready', label: 'Tool-ready' };
  return { tier: 'ai_ambitious', label: 'AI-ambitious' };
}

router.post('/', submitLimiter, async (req, res) => {
  // Honeypot: bots fill every field; humans never see this one.
  if ((req.body?.website || '').trim() !== '') {
    return res.status(201).json({ submitted: true });
  }

  const orgName = String(req.body?.org_name || '').trim();
  const contactName = String(req.body?.contact_name || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const phone = String(req.body?.phone || '').trim();
  if (!orgName) {
    return res.status(400).json({ error: 'Organization name is required' });
  }
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }
  if (phone && !/^\+?[\d\s-]{10,}$/.test(phone)) {
    return res.status(400).json({ error: 'Invalid phone number' });
  }

  const raw = req.body?.answers;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return res.status(400).json({ error: 'Answers are required' });
  }
  const answers: Record<string, number> = {};
  for (const q of READINESS_QUESTIONS) {
    const value = Number((raw as Record<string, unknown>)[q.key]);
    if (!Number.isInteger(value) || value < 1 || value > 5) {
      return res.status(400).json({ error: `Answer all 8 questions with a score of 1–5` });
    }
    answers[q.key] = value;
  }

  const total = Object.values(answers).reduce((sum, v) => sum + v, 0);
  const { tier, label } = readinessTier(total);
  const recommendations = [...READINESS_QUESTIONS]
    .sort((a, b) => answers[a.key] - answers[b.key])
    .slice(0, 3)
    .map((q) => ({ dimension: q.dimension, score: answers[q.key], module: q.module }));

  await pool.query(
    `INSERT INTO readiness_assessments (org_name, contact_name, email, phone, answers, total_score, tier)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
    [orgName, contactName || null, email || null, phone || null, JSON.stringify(answers), total, tier]
  );

  res.status(201).json({ submitted: true, total, tier, tier_label: label, recommendations });
});

export default router;
