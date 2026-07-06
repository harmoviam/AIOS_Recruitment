import { pool } from '../dbConfig.js';

/**
 * Follow-up rules engine.
 *
 * Runs lazily (and idempotently) whenever the Follow-up Center is loaded, so
 * no cron/scheduler is required in development. Every generated follow-up is
 * deduplicated with a rule key (interview_id + category, or candidate +
 * category + milestone_day), so calling sync repeatedly never duplicates work.
 *
 * Rules implemented:
 *  A. interview_prep / interview_day — candidates with a scheduled interview
 *     get a reminder follow-up the day before and on the interview day.
 *  B. offer_followup — candidates in stage "selected" are chased every
 *     OFFER_CADENCE_DAYS until the recruiter records "not interested" /
 *     "joined elsewhere", or the candidate moves to "joined".
 *  C. no_response — when an interview reminder is completed with outcome
 *     "no_answer" (candidate not picking calls on prep/interview day), an
 *     escalated retry follow-up is created (see followUps route PATCH).
 *  D. onboarding — joined candidates get check-in follow-ups on days
 *     7, 30, 45, 80 and 91 after their joining date; recruiters record the
 *     outcome of each.
 */

export const ONBOARDING_MILESTONES = [7, 30, 45, 80, 91];
export const OFFER_CADENCE_DAYS = 3;

export const CLOSING_OUTCOMES = ['not_interested', 'joined_elsewhere', 'left_company'];

export async function syncFollowUps(tenantId: number): Promise<void> {
  // Fail-safe: a sync problem must never take the Follow-up Center down.
  const results = await Promise.allSettled([
    syncInterviewReminders(tenantId),
    syncOfferFollowUps(tenantId),
    syncOnboardingMilestones(tenantId),
  ]);
  for (const r of results) {
    if (r.status === 'rejected') console.error('Follow-up sync rule failed:', r.reason);
  }
}

/** Rule A: reminders the day before and on the day of each upcoming interview. */
async function syncInterviewReminders(tenantId: number): Promise<void> {
  const { rows: interviews } = await pool.query(
    `SELECT i.id, i.candidate_id, i.scheduled_at, c.recruiter_id, c.name
     FROM interviews i
     JOIN candidates c ON c.id = i.candidate_id
     WHERE c.tenant_id = $1
       AND i.status IN ('pending', 'confirmed')
       AND i.scheduled_at > NOW()`,
    [tenantId]
  );

  for (const iv of interviews) {
    const scheduled = new Date(iv.scheduled_at);
    const dayBefore = new Date(scheduled.getTime() - 24 * 3600 * 1000);
    const sameDay = new Date(scheduled.getTime() - 2 * 3600 * 1000); // 2h before the slot

    await insertRuleFollowUp(tenantId, {
      candidateId: iv.candidate_id,
      assignedTo: iv.recruiter_id,
      category: 'interview_prep',
      interviewId: iv.id,
      dueAt: clampToNow(dayBefore),
      type: 'call',
      aiSuggestion: `Interview on ${scheduled.toLocaleString()} — confirm attendance, share meeting link & documents checklist.`,
    });

    await insertRuleFollowUp(tenantId, {
      candidateId: iv.candidate_id,
      assignedTo: iv.recruiter_id,
      category: 'interview_day',
      interviewId: iv.id,
      dueAt: clampToNow(sameDay),
      type: 'call',
      aiSuggestion: `Interview today at ${scheduled.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} — final confirmation call; if no answer, escalate immediately.`,
    });
  }
}

/** Rule B: chase selected-but-not-joined candidates until they answer definitively. */
async function syncOfferFollowUps(tenantId: number): Promise<void> {
  const { rows: candidates } = await pool.query(
    `SELECT c.id, c.recruiter_id,
       (SELECT MAX(f.completed_at) FROM follow_ups f
         WHERE f.tenant_id = c.tenant_id AND f.candidate_id = c.id AND f.category = 'offer_followup') AS last_done
     FROM candidates c
     WHERE c.tenant_id = $1
       AND c.stage = 'selected'
       AND COALESCE(c.offer_status, '') NOT IN ('not_interested', 'joined_elsewhere')
       AND NOT EXISTS (
         SELECT 1 FROM follow_ups f
         WHERE f.tenant_id = c.tenant_id AND f.candidate_id = c.id
           AND f.category = 'offer_followup'
           AND f.completed_at IS NULL AND f.status NOT IN ('completed', 'missed')
       )`,
    [tenantId]
  );

  for (const c of candidates) {
    const base = c.last_done
      ? new Date(new Date(c.last_done).getTime() + OFFER_CADENCE_DAYS * 24 * 3600 * 1000)
      : new Date();
    await pool.query(
      `INSERT INTO follow_ups (tenant_id, candidate_id, assigned_to, due_at, type, status, category, ai_suggestion)
       VALUES ($1, $2, $3, $4, 'call', 'upcoming', 'offer_followup',
         'Selected — confirm joining date. Keep following up until the candidate confirms, declines, or reports joining elsewhere.')`,
      [tenantId, c.id, c.recruiter_id, clampToNow(base).toISOString()]
    );
  }
}

/** Rule D: post-joining check-ins on days 7 / 30 / 45 / 80 / 91. */
async function syncOnboardingMilestones(tenantId: number): Promise<void> {
  const { rows: joined } = await pool.query(
    `SELECT c.id, c.recruiter_id, c.joined_at
     FROM candidates c
     WHERE c.tenant_id = $1 AND c.stage = 'joined' AND c.joined_at IS NOT NULL
       AND COALESCE(c.offer_status, '') NOT IN ('not_interested', 'joined_elsewhere', 'left_company')`,
    [tenantId]
  );

  for (const c of joined) {
    const joinedAt = new Date(c.joined_at);
    for (const day of ONBOARDING_MILESTONES) {
      const due = new Date(joinedAt.getTime() + day * 24 * 3600 * 1000);
      due.setHours(10, 0, 0, 0);
      await pool.query(
        `INSERT INTO follow_ups (tenant_id, candidate_id, assigned_to, due_at, type, status, category, milestone_day, ai_suggestion)
         SELECT $1, $2, $3, $4::timestamptz, 'call', 'upcoming', 'onboarding', $5::int, $6
         WHERE NOT EXISTS (
           SELECT 1 FROM follow_ups f
           WHERE f.tenant_id = $1 AND f.candidate_id = $2
             AND f.category = 'onboarding' AND f.milestone_day = $5::int
         )`,
        [
          tenantId,
          c.id,
          c.recruiter_id,
          due.toISOString(),
          day,
          `Day ${day} post-joining check-in — confirm the candidate is settled; flag attrition risk early.`,
        ]
      );
    }
  }
}

/**
 * Rule C helper: escalation when a candidate doesn't pick up on the day
 * before / day of the interview. Called from the follow-ups PATCH route when
 * an interview reminder is completed with outcome "no_answer".
 */
export async function createNoResponseEscalation(
  tenantId: number,
  parent: { id: number; candidate_id: number; assigned_to: number | null; interview_id: number | null }
): Promise<void> {
  const { rows: existing } = await pool.query(
    `SELECT 1 FROM follow_ups WHERE tenant_id = $1 AND parent_id = $2 LIMIT 1`,
    [tenantId, parent.id]
  );
  if (existing.length > 0) return;

  const due = new Date(Date.now() + 2 * 3600 * 1000); // retry in 2 hours
  await pool.query(
    `INSERT INTO follow_ups (tenant_id, candidate_id, assigned_to, due_at, type, status, category, interview_id, parent_id, escalated, ai_suggestion)
     VALUES ($1, $2, $3, $4, 'whatsapp', 'upcoming', 'no_response', $5, $6, TRUE,
       'Candidate not picking calls before the interview — retry, and switch channel: send a WhatsApp + email with the interview details.')`,
    [tenantId, parent.candidate_id, parent.assigned_to, due.toISOString(), parent.interview_id, parent.id]
  );
}

/** Close every open rule follow-up of the given categories for a candidate. */
export async function closeOpenFollowUps(
  tenantId: number,
  candidateId: number,
  categories: string[],
  outcome: string
): Promise<void> {
  await pool.query(
    `UPDATE follow_ups
     SET status = 'completed', completed_at = NOW(), outcome = $4
     WHERE tenant_id = $1 AND candidate_id = $2 AND category = ANY($3)
       AND completed_at IS NULL AND status NOT IN ('completed', 'missed')`,
    [tenantId, candidateId, categories, outcome]
  );
}

interface RuleFollowUp {
  candidateId: number;
  assignedTo: number | null;
  category: string;
  interviewId: number;
  dueAt: Date;
  type: string;
  aiSuggestion: string;
}

async function insertRuleFollowUp(tenantId: number, fu: RuleFollowUp): Promise<void> {
  await pool.query(
    `INSERT INTO follow_ups (tenant_id, candidate_id, assigned_to, due_at, type, status, category, interview_id, ai_suggestion)
     SELECT $1, $2, $3, $4, $5, 'upcoming', $6, $7, $8
     WHERE NOT EXISTS (
       SELECT 1 FROM follow_ups f
       WHERE f.tenant_id = $1 AND f.interview_id = $7 AND f.category = $6
     )`,
    [tenantId, fu.candidateId, fu.assignedTo, fu.dueAt.toISOString(), fu.type, fu.category, fu.interviewId, fu.aiSuggestion]
  );
}

/** Never generate follow-ups in the past — surface them as due now instead. */
function clampToNow(d: Date): Date {
  return d.getTime() < Date.now() ? new Date() : d;
}
