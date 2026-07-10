/**
 * Pre-approved messaging templates (WhatsApp / email) for every automated
 * follow-up in the candidate journey. Rendered server-side with the
 * candidate's details and attached to each follow-up row, so the Follow-up
 * Center offers a ready-to-send message next to every reminder.
 *
 * The copy is intentionally short, warm and channel-neutral: it reads well
 * both as a WhatsApp message and as an email body. `*text*` renders bold on
 * WhatsApp.
 *
 * Flows covered:
 *  - Pre-interview  — Step 1 immediate reinforcement (right after the
 *    telephonic round / scheduling), Step 2 evening reminder (day before),
 *    Step 3 morning reminder (interview day), plus the unreachable retry.
 *  - Post-selected  — joining-date chase and the -7 / -1 / 0 milestones.
 *  - Post-joining   — retention check-ins on Day 7 / 15 / 30 / 45 / 61 / 80
 *    and the tenure-completion message on tenure end + 1 (e.g. Day 91).
 */

const fmtDate = (d: Date) =>
  d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtTime = (d: Date) =>
  d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
const fmtDateTime = (d: Date) => `${fmtDate(d)} at ${fmtTime(d)}`;

/** "Priya Sharma" → "Priya"; missing name → "there". */
const firstName = (name?: string | null) => (name || '').trim().split(/\s+/)[0] || 'there';

/** "Customer Support" → "the Customer Support role"; missing → "the role". */
const roleOf = (jobTitle?: string | null) => (jobTitle ? `the ${jobTitle} role` : 'the role');

/** Step 1 — immediate reinforcement, sent right after scheduling the interview. */
export function interviewScheduledMessage(
  name: string | null | undefined,
  jobTitle: string | null | undefined,
  interviewAt: Date,
  joinLink?: string | null
): string {
  const linkBlock = joinLink
    ? `\n\nJoin the video interview here: ${joinLink}`
    : '';

  return `Hi ${firstName(name)},

Thank you for attending the telephonic call today for ${roleOf(jobTitle)}.

As discussed, the next step is scheduled on ${fmtDateTime(interviewAt)}. We look forward to your participation.${linkBlock}

Please reply *CONFIRMED* once you receive this message.`;
}

/** Step 2 — evening reminder, the day before the interview. */
function interviewPrepMessage(name: string | null | undefined, jobTitle: string | null | undefined, interviewAt: Date | null): string {
  return `Hi ${firstName(name)},

Just a quick reminder about your upcoming interview tomorrow for ${roleOf(jobTitle)}.

We are excited to have you move forward in the process.

See you tomorrow${interviewAt ? ` at ${fmtTime(interviewAt)}` : ''}.`;
}

/** Step 3 — morning reminder, on the interview day. */
function interviewDayMessage(name: string | null | undefined, jobTitle: string | null | undefined, interviewAt: Date | null): string {
  const interview = jobTitle ? `the ${jobTitle} interview` : 'your interview';
  return `Good morning ${firstName(name)},

Looking forward to meeting you today for ${interview}${interviewAt ? ` at ${fmtTime(interviewAt)}` : ''}.

Please reach out if you need any assistance locating the office or joining the call.`;
}

/** Escalated retry when the candidate is unreachable before the interview. */
function noResponseMessage(name: string | null | undefined, jobTitle: string | null | undefined, interviewAt: Date | null): string {
  return `Hi ${firstName(name)},

We tried reaching you regarding your interview for ${roleOf(jobTitle)}${interviewAt ? ` scheduled on ${fmtDateTime(interviewAt)}` : ''} but couldn't connect.

Please reply *CONFIRMED* to let us know you are attending, or share a convenient time for a quick call.`;
}

/** Post-selected: chase (no milestone) + the -7 / -1 / 0 joining milestones. */
function offerMessage(
  name: string | null | undefined,
  jobTitle: string | null | undefined,
  milestoneDay: number | null,
  joiningAt: Date | null
): string {
  const n = firstName(name);
  const role = roleOf(jobTitle);
  switch (milestoneDay) {
    case -7:
      return `Hi ${n},

Congratulations once again on your selection for ${role}!

Your joining is one week away${joiningAt ? `, on ${fmtDate(joiningAt)}` : ''}. Please keep your documents ready, and let us know if you need any help with the notice period or anything else.

We are excited to welcome you aboard!`;
    case -1:
      return `Hi ${n},

A quick reminder — your joining for ${role} is tomorrow${joiningAt ? `, ${fmtDate(joiningAt)}` : ''}.

Please reach out if you have any questions about the reporting time, location or documents.

See you tomorrow!`;
    case 0:
      return `Good morning ${n},

Welcome aboard! Today is your joining day for ${role}.

Please confirm once you have reported, and reach out if you need any assistance locating the office or completing the formalities.`;
    default:
      return `Hi ${n},

Congratulations on your selection for ${role}!

To plan your onboarding smoothly, could you please confirm your expected joining date? Reply here with the date and we will take care of the rest.`;
  }
}

/** Post-joining retention check-ins, keyed by milestone day. */
const ONBOARDING_MESSAGES: Record<number, (n: string, role: string) => string> = {
  7: (n, role) => `Hi ${n},

Congratulations on completing your first week in ${role}! 🎉

How has the experience been so far — training, team and workplace? If anything needs attention, reply here and we will help sort it out.

We are glad to have you on board!`,
  15: (n, role) => `Hi ${n},

You have completed two weeks in ${role} — great going!

How are you settling in with your team and daily work? If you have any questions or concerns, reply here and we will address them right away.`,
  30: (n, role) => `Hi ${n},

Congratulations on completing your first month in ${role}! 🎉

We would love to hear how the journey has been so far. Is there anything you would like us to know or help with?

Keep up the great work!`,
  45: (n, role) => `Hi ${n},

You are now 45 days into ${role} — well done on the steady progress!

How are things going with your work and team? If there is anything on your mind, we are just a message away.`,
  61: (n, role) => `Hi ${n},

Two months completed in ${role} — well done!

We hope you are feeling settled and confident in your work. Do share a quick update on how things are going, and let us know if there is anything we can support you with.`,
  80: (n, role) => `Hi ${n},

You are almost at the 90-day milestone in ${role} — just a couple of weeks to go!

How is everything at work? If there is anything you would like to discuss before completing your first quarter, we are here to help.`,
};

/** Tenure-completion message (milestone = tenure end + 1, e.g. Day 91). */
function tenureCompleteMessage(n: string, role: string, tenureDays: number): string {
  return `Hi ${n},

Congratulations on successfully completing your first ${tenureDays} days in ${role}! 🎉

It has been wonderful seeing your journey from the interview to today. We wish you continued success ahead.

Thank you for being a great part of this journey!`;
}

function onboardingMessage(
  name: string | null | undefined,
  jobTitle: string | null | undefined,
  milestoneDay: number | null
): string {
  const n = firstName(name);
  const role = roleOf(jobTitle);
  if (milestoneDay != null && ONBOARDING_MESSAGES[milestoneDay]) {
    return ONBOARDING_MESSAGES[milestoneDay](n, role);
  }
  // Any day outside the base schedule is the tenure-end confirmation
  // (91 for 90-day tenure, 61 for 60, 46 for 45, 31 for 30).
  const tenure = milestoneDay != null ? milestoneDay - 1 : 90;
  return tenureCompleteMessage(n, role, tenure);
}

interface FollowUpRow {
  category?: string | null;
  milestone_day?: number | null;
  candidate_name?: string | null;
  job_title?: string | null;
  interview_at?: string | Date | null;
  candidate_expected_joining_at?: string | Date | null;
}

const asDate = (v: string | Date | null | undefined): Date | null => (v ? new Date(v) : null);

/** The ready-to-send message for a follow-up row (null for manual follow-ups). */
export function followUpMessageTemplate(f: FollowUpRow): string | null {
  const name = f.candidate_name;
  const job = f.job_title;
  switch (f.category) {
    case 'interview_prep':
      return interviewPrepMessage(name, job, asDate(f.interview_at));
    case 'interview_day':
      return interviewDayMessage(name, job, asDate(f.interview_at));
    case 'no_response':
      return noResponseMessage(name, job, asDate(f.interview_at));
    case 'offer_followup':
      return offerMessage(name, job, f.milestone_day ?? null, asDate(f.candidate_expected_joining_at));
    case 'onboarding':
      return onboardingMessage(name, job, f.milestone_day ?? null);
    default:
      return null;
  }
}
