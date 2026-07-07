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
 *  B. offer_followup — selected candidates with an expected joining date get
 *     milestone reminders 1 week before, 1 day before and on the joining day
 *     (milestone_day -7 / -1 / 0). Until a joining date is set they are
 *     chased every OFFER_CADENCE_DAYS to pin one down. Chasing stops when the
 *     recruiter records "not interested" / "joined elsewhere", or the
 *     candidate moves to "joined".
 *  C. no_response — when an interview reminder is completed with outcome
 *     "no_answer" (candidate not picking calls on prep/interview day), an
 *     escalated retry follow-up is created (see followUps route PATCH).
 *  D. onboarding — joined candidates get check-in follow-ups after their
 *     joining date; recruiters record the outcome of each. The schedule is
 *     derived from the job's tenure (30/45/60/90 days): every base check-in
 *     day within the tenure, plus a final confirmation the day after the
 *     tenure ends (e.g. 90 → 91, 60 → 61). Jobs without a tenure use the
 *     full 90-day plan. These check-ins are fixed — they cannot be
 *     rescheduled (see followUps route PATCH).
 */

const BASE_ONBOARDING_CHECKINS = [7, 15, 30, 45, 61, 80];
export const DEFAULT_TENURE_DAYS = 90;

/** Check-in days for a job tenure: base days inside the tenure + tenure end + 1. */
export function onboardingMilestonesForTenure(tenureDays: number | null | undefined): number[] {
  const tenure = tenureDays || DEFAULT_TENURE_DAYS;
  return [...BASE_ONBOARDING_CHECKINS.filter((d) => d < tenure), tenure + 1];
}

/** Days relative to the expected joining date: 1 week before, 1 day before, joining day. */
export const JOINING_MILESTONES = [-7, -1, 0];
export const OFFER_CADENCE_DAYS = 3;

const JOINING_MILESTONE_SUGGESTIONS: Record<number, string> = {
  [-7]: '1 week to joining — confirm the candidate is on track: notice period served, documents ready, no counter-offer risk.',
  [-1]: 'Joining tomorrow — final confirmation call; share reporting time, location / meeting link and first-day checklist.',
  [0]: 'Joining day — confirm the candidate has reported. Once confirmed, move them to Joined; if unreachable, escalate immediately.',
};

export const CLOSING_OUTCOMES = ['not_interested', 'joined_elsewhere', 'offer_rejected', 'left_company'];

/** Close pre-join follow-ups and schedule post-joining milestones when a candidate joins. */
export async function onCandidateJoined(tenantId: number, candidateId: number): Promise<void> {
  await closeOpenFollowUps(
    tenantId,
    candidateId,
    ['offer_followup', 'interview_prep', 'interview_day', 'no_response'],
    'auto_closed'
  );
  await syncOnboardingMilestones(tenantId);
}

export async function syncFollowUps(tenantId: number): Promise<void> {
  await cleanupStaleFollowUpsForJoined(tenantId);
  const results = await Promise.allSettled([
    syncInterviewReminders(tenantId),
    syncOfferFollowUps(tenantId),
    syncOnboardingMilestones(tenantId),
  ]);
  for (const r of results) {
    if (r.status === 'rejected') console.error('Follow-up sync rule failed:', r.reason);
  }
}

/** Close pre-join follow-ups left open after a candidate was moved to Joined. */
async function cleanupStaleFollowUpsForJoined(tenantId: number): Promise<void> {
  const { rows } = await pool.query(
    `SELECT DISTINCT c.id FROM candidates c
     JOIN follow_ups f ON f.candidate_id = c.id AND f.tenant_id = c.tenant_id
     WHERE c.tenant_id = $1 AND c.stage = 'joined'
       AND f.category = ANY($2)
       AND f.completed_at IS NULL AND f.status NOT IN ('completed', 'missed')`,
    [tenantId, ['offer_followup', 'interview_prep', 'interview_day', 'no_response']]
  );
  for (const { id } of rows) {
    await closeOpenFollowUps(
      tenantId,
      id,
      ['offer_followup', 'interview_prep', 'interview_day', 'no_response'],
      'auto_closed'
    );
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

/**
 * Rule B: selected-but-not-joined candidates.
 * With an expected joining date → milestone reminders at -7 / -1 / 0 days.
 * Without one → periodic chase (every OFFER_CADENCE_DAYS) to pin the date down.
 */
async function syncOfferFollowUps(tenantId: number): Promise<void> {
  const { rows: candidates } = await pool.query(
    `SELECT c.id, c.recruiter_id, c.expected_joining_at,
       (SELECT MAX(f.completed_at) FROM follow_ups f
         WHERE f.tenant_id = c.tenant_id AND f.candidate_id = c.id AND f.category = 'offer_followup') AS last_done
     FROM candidates c
     WHERE c.tenant_id = $1
       AND c.stage = 'selected'
       AND COALESCE(c.offer_status, '') NOT IN ('not_interested', 'joined_elsewhere', 'offer_rejected')`,
    [tenantId]
  );

  for (const c of candidates) {
    if (c.expected_joining_at) {
      const joining = new Date(c.expected_joining_at);
      for (const day of JOINING_MILESTONES) {
        const due = new Date(joining.getTime() + day * 24 * 3600 * 1000);
        due.setHours(10, 0, 0, 0);
        // Milestones more than 2 days past would only add noise.
        if (due.getTime() < Date.now() - 2 * 24 * 3600 * 1000) continue;
        await pool.query(
          `INSERT INTO follow_ups (tenant_id, candidate_id, assigned_to, due_at, type, status, category, milestone_day, ai_suggestion)
           VALUES ($1, $2, $3, $4::timestamptz, 'call', 'upcoming', 'offer_followup', $5::int, $6)
           ON CONFLICT DO NOTHING`,
          [
            tenantId,
            c.id,
            c.recruiter_id,
            clampToNow(due).toISOString(),
            day,
            JOINING_MILESTONE_SUGGESTIONS[day],
          ]
        );
      }
      // The milestone plan replaces the generic "confirm joining date" chase.
      await pool.query(
        `UPDATE follow_ups
         SET status = 'completed', completed_at = NOW(), outcome = 'auto_closed'
         WHERE tenant_id = $1 AND candidate_id = $2 AND category = 'offer_followup'
           AND milestone_day IS NULL AND completed_at IS NULL AND status NOT IN ('completed', 'missed')`,
        [tenantId, c.id]
      );
    } else {
      const base = c.last_done
        ? new Date(new Date(c.last_done).getTime() + OFFER_CADENCE_DAYS * 24 * 3600 * 1000)
        : new Date();
      await pool.query(
        `INSERT INTO follow_ups (tenant_id, candidate_id, assigned_to, due_at, type, status, category, ai_suggestion)
         VALUES ($1, $2, $3, $4, 'call', 'upcoming', 'offer_followup',
           'Selected — pin down the expected joining date. Once it is set, reminders for 1 week before, 1 day before and the joining day are scheduled automatically.')
         ON CONFLICT DO NOTHING`,
        [tenantId, c.id, c.recruiter_id, clampToNow(base).toISOString()]
      );
    }
  }
}

/** Rule D: post-joining check-ins, scheduled from the job's tenure (see onboardingMilestonesForTenure). */
async function syncOnboardingMilestones(tenantId: number): Promise<void> {
  const { rows: joined } = await pool.query(
    `SELECT c.id, c.recruiter_id, c.joined_at, j.tenure_days
     FROM candidates c
     LEFT JOIN jobs j ON j.id = c.job_id AND j.tenant_id = c.tenant_id
     WHERE c.tenant_id = $1 AND c.stage = 'joined' AND c.joined_at IS NOT NULL
       AND COALESCE(c.offer_status, '') NOT IN ('not_interested', 'joined_elsewhere', 'left_company')`,
    [tenantId]
  );

  for (const c of joined) {
    const joinedAt = new Date(c.joined_at);
    for (const day of onboardingMilestonesForTenure(c.tenure_days)) {
      const due = new Date(joinedAt.getTime() + day * 24 * 3600 * 1000);
      due.setHours(10, 0, 0, 0);
      await pool.query(
        `INSERT INTO follow_ups (tenant_id, candidate_id, assigned_to, due_at, type, status, category, milestone_day, ai_suggestion)
         VALUES ($1, $2, $3, $4::timestamptz, 'call', 'upcoming', 'onboarding', $5::int, $6)
         ON CONFLICT DO NOTHING`,
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
     VALUES ($1, $2, $3, $4, $5, 'upcoming', $6, $7, $8)
     ON CONFLICT DO NOTHING`,
    [tenantId, fu.candidateId, fu.assignedTo, fu.dueAt.toISOString(), fu.type, fu.category, fu.interviewId, fu.aiSuggestion]
  );
}

/** Never generate follow-ups in the past — surface them as due now instead. */
function clampToNow(d: Date): Date {
  return d.getTime() < Date.now() ? new Date() : d;
}
