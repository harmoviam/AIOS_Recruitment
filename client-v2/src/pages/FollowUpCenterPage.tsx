import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import TopBar from '../components/ui/TopBar';
import PageHeader from '../components/ui/PageHeader';
import Tabs from '../components/ui/Tabs';
import {
  FOLLOW_UP_CATEGORIES,
  FOLLOW_UP_FLOWS,
  type FollowUp,
  type FollowUpFlow,
} from '../types';

const TAB_IDS = ['today', 'overdue', 'upcoming', 'completed', 'missed'] as const;

/** Outcome choices per rule category. `closes` = stops future auto follow-ups. */
const OUTCOME_OPTIONS: Record<string, { id: string; label: string; closes?: boolean }[]> = {
  interview_prep: [
    { id: 'confirmed', label: '✓ Confirmed attendance' },
    { id: 'no_answer', label: '📵 Not picking calls' },
    { id: 'rescheduled', label: '📅 Rescheduled' },
  ],
  interview_day: [
    { id: 'confirmed', label: '✓ Confirmed — on the way' },
    { id: 'no_answer', label: '📵 Not picking calls' },
    { id: 'rescheduled', label: '📅 Rescheduled' },
  ],
  no_response: [
    { id: 'connected', label: '✓ Reached & confirmed' },
    { id: 'no_answer', label: '📵 Still no answer' },
    { id: 'not_interested', label: '✗ Not interested', closes: true },
  ],
  offer_followup: [
    { id: 'connected', label: '✓ Spoke — still joining' },
    { id: 'no_answer', label: '📵 No answer' },
    { id: 'offer_rejected', label: '✗ Offer rejected', closes: true },
    { id: 'not_interested', label: '✗ Not interested', closes: true },
    { id: 'joined_elsewhere', label: '✗ Joined elsewhere', closes: true },
  ],
  onboarding: [
    { id: 'doing_well', label: '✓ Doing well' },
    { id: 'no_answer', label: '📵 No answer' },
    { id: 'issue_flagged', label: '⚠ Issue flagged' },
    { id: 'left_company', label: '✗ Left the company', closes: true },
  ],
  manual: [
    { id: 'done', label: '✓ Done' },
    { id: 'no_answer', label: '📵 No answer' },
  ],
};

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  FOLLOW_UP_CATEGORIES.map((c) => [c.id, c.label])
);

const OUTCOME_LABELS: Record<string, string> = {
  confirmed: 'Confirmed',
  connected: 'Connected',
  no_answer: 'No answer',
  rescheduled: 'Rescheduled',
  not_interested: 'Not interested',
  offer_rejected: 'Offer rejected',
  joined_elsewhere: 'Joined elsewhere',
  doing_well: 'Doing well',
  issue_flagged: 'Issue flagged',
  left_company: 'Left company',
  done: 'Done',
  auto_closed: 'Auto-closed',
};

/** milestone_day → label for Post-Selected joining reminders (-7 / -1 / 0). */
const JOINING_MILESTONE_LABELS: Record<number, string> = {
  [-7]: '1 week before joining',
  [-1]: '1 day before joining',
  [0]: 'Joining day',
};

const CATEGORY_TO_FLOW: Record<string, FollowUpFlow> = Object.fromEntries(
  FOLLOW_UP_FLOWS.flatMap((fl) => fl.categories.map((c) => [c, fl.id]))
);

function flowOf(f: FollowUp): FollowUpFlow {
  return CATEGORY_TO_FLOW[f.category || 'manual'] || 'manual';
}

/** Human label for the step this follow-up represents in its flow. */
function milestoneLabel(f: FollowUp): string | null {
  switch (f.category) {
    case 'interview_prep':
      return '1 day before interview';
    case 'interview_day':
      return 'Interview day';
    case 'no_response':
      return 'Unreachable — escalated retry';
    case 'offer_followup':
      if (f.milestone_day == null) return 'Confirm joining date';
      return JOINING_MILESTONE_LABELS[f.milestone_day] ?? `Day ${f.milestone_day}`;
    case 'onboarding':
      return f.milestone_day != null ? `Day ${f.milestone_day} check-in` : 'Check-in';
    default:
      return null;
  }
}

type StepState = 'done' | 'missed' | 'current' | 'pending';
interface JourneyStep {
  label: string;
  state: StepState;
}

/** The candidate's full step sequence for this card's flow, with progress. */
function journeySteps(f: FollowUp, all: FollowUp[]): JourneyStep[] | null {
  const stateOf = (x: FollowUp): StepState =>
    x.id === f.id
      ? 'current'
      : x.status === 'completed'
        ? 'done'
        : x.status === 'missed'
          ? 'missed'
          : 'pending';

  const flow = flowOf(f);

  if (flow === 'pre_interview' && f.interview_id) {
    const related = all.filter(
      (x) => x.interview_id === f.interview_id && x.candidate_id === f.candidate_id
    );
    const prep = related.find((x) => x.category === 'interview_prep');
    const day = related.find((x) => x.category === 'interview_day');
    const retries = related
      .filter((x) => x.category === 'no_response')
      .sort((a, b) => a.due_at.localeCompare(b.due_at));
    const steps: JourneyStep[] = [];
    if (prep) steps.push({ label: '1 day before', state: stateOf(prep) });
    if (day) steps.push({ label: 'Interview day', state: stateOf(day) });
    retries.forEach((r, idx) =>
      steps.push({ label: retries.length > 1 ? `Retry ${idx + 1}` : 'Retry', state: stateOf(r) })
    );
    return steps.length > 1 ? steps : null;
  }

  if (flow === 'post_selected') {
    const milestones = all
      .filter(
        (x) =>
          x.candidate_id === f.candidate_id &&
          x.category === 'offer_followup' &&
          x.milestone_day != null
      )
      .sort((a, b) => (a.milestone_day ?? 0) - (b.milestone_day ?? 0));
    if (milestones.length < 2) return null;
    return milestones.map((m) => ({
      label: JOINING_MILESTONE_LABELS[m.milestone_day!] ?? `Day ${m.milestone_day}`,
      state: stateOf(m),
    }));
  }

  if (flow === 'post_joining') {
    const milestones = all
      .filter((x) => x.candidate_id === f.candidate_id && x.category === 'onboarding')
      .sort((a, b) => (a.milestone_day ?? 0) - (b.milestone_day ?? 0));
    if (milestones.length < 2) return null;
    return milestones.map((m) => ({ label: `Day ${m.milestone_day}`, state: stateOf(m) }));
  }

  return null;
}

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString([], { dateStyle: 'medium' });
const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

export default function FollowUpCenterPage() {
  const navigate = useNavigate();
  const [flow, setFlow] = useState<'all' | FollowUpFlow>('all');
  const [tab, setTab] = useState<string>('today');
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [rescheduling, setRescheduling] = useState<FollowUp | null>(null);
  const [rescheduleAt, setRescheduleAt] = useState('');
  const [completing, setCompleting] = useState<FollowUp | null>(null);
  const [outcome, setOutcome] = useState('');
  const [outcomeNote, setOutcomeNote] = useState('');
  const [settingDateFor, setSettingDateFor] = useState<FollowUp | null>(null);
  const [joiningDate, setJoiningDate] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const load = async () => {
    // GET /follow-ups triggers the server-side rule sync, so one call is enough.
    setFollowUps(await api.getFollowUps());
  };

  useEffect(() => {
    load();
  }, []);

  const flowFiltered = useMemo(
    () => (flow === 'all' ? followUps : followUps.filter((f) => flowOf(f) === flow)),
    [followUps, flow]
  );

  /** Items needing action now (today + overdue), per flow — shown on the flow cards. */
  const dueCounts = useMemo(() => {
    const acc: Record<string, number> = { all: 0 };
    for (const f of followUps) {
      if (f.status !== 'today' && f.status !== 'overdue') continue;
      acc.all += 1;
      const fl = flowOf(f);
      acc[fl] = (acc[fl] || 0) + 1;
    }
    return acc;
  }, [followUps]);

  const tabCounts = useMemo(() => {
    const acc: Record<string, number> = { today: 0, overdue: 0, upcoming: 0, completed: 0, missed: 0 };
    for (const f of flowFiltered) {
      if (f.status in acc) acc[f.status] += 1;
      // "Today" tab shows overdue items too, so count them there as well.
      if (f.status === 'overdue') acc.today += 1;
    }
    return acc;
  }, [flowFiltered]);

  const filtered = useMemo(
    () =>
      tab === 'today'
        ? flowFiltered.filter((f) => f.status === 'today' || f.status === 'overdue')
        : flowFiltered.filter((f) => f.status === tab),
    [flowFiltered, tab]
  );

  const openComplete = (f: FollowUp) => {
    setCompleting(f);
    setOutcome('');
    setOutcomeNote('');
  };

  const saveOutcome = async () => {
    if (!completing || !outcome) return;
    setBusyId(completing.id);
    try {
      await api.updateFollowUp(completing.id, {
        completed: true,
        outcome,
        ...(outcomeNote.trim() ? { notes: outcomeNote.trim() } : {}),
      });
      setCompleting(null);
      load();
    } finally {
      setBusyId(null);
    }
  };

  const markMissed = async (id: number) => {
    setBusyId(id);
    try {
      await api.updateFollowUp(id, { status: 'missed' });
      load();
    } finally {
      setBusyId(null);
    }
  };

  const call = (f: FollowUp) => {
    if (f.candidate_phone) {
      window.location.href = `tel:${f.candidate_phone.replace(/\s+/g, '')}`;
    } else {
      alert('No phone number on file for this candidate.');
    }
  };

  const whatsapp = (f: FollowUp) => {
    const draft = f.message_template ? `&draft=${encodeURIComponent(f.message_template)}` : '';
    navigate(`/messages?candidate=${f.candidate_id}&from=${encodeURIComponent('/follow-ups')}${draft}`);
  };

  const email = (f: FollowUp) => {
    if (f.candidate_email) {
      const subject = encodeURIComponent(`Regarding ${f.job_title || 'your application'}`);
      const body = f.message_template ? `&body=${encodeURIComponent(f.message_template)}` : '';
      window.location.href = `mailto:${f.candidate_email}?subject=${subject}${body}`;
    } else {
      alert('No email on file for this candidate.');
    }
  };

  const copyTemplate = async (f: FollowUp) => {
    if (!f.message_template) return;
    await navigator.clipboard.writeText(f.message_template);
    setCopiedId(f.id);
    setTimeout(() => setCopiedId((id) => (id === f.id ? null : id)), 2000);
  };

  const openReschedule = (f: FollowUp) => {
    setRescheduling(f);
    setRescheduleAt(toLocalInput(f.due_at));
  };

  const saveReschedule = async () => {
    if (!rescheduling || !rescheduleAt) return;
    setBusyId(rescheduling.id);
    try {
      await api.updateFollowUp(rescheduling.id, {
        due_at: new Date(rescheduleAt).toISOString(),
        status: 'upcoming',
      });
      setRescheduling(null);
      load();
    } finally {
      setBusyId(null);
    }
  };

  const openSetJoiningDate = (f: FollowUp) => {
    setSettingDateFor(f);
    setJoiningDate(
      f.candidate_expected_joining_at
        ? new Date(f.candidate_expected_joining_at).toISOString().slice(0, 10)
        : ''
    );
  };

  const saveJoiningDate = async () => {
    if (!settingDateFor || !joiningDate) return;
    setBusyId(settingDateFor.id);
    try {
      await api.updateCandidate(settingDateFor.candidate_id, {
        expected_joining_at: new Date(`${joiningDate}T10:00:00`).toISOString(),
      });
      setSettingDateFor(null);
      // Reload — the engine replaces the chase with -7 / -1 / 0 milestones.
      load();
    } finally {
      setBusyId(null);
    }
  };

  const completingOptions = completing
    ? OUTCOME_OPTIONS[completing.category || 'manual'] || OUTCOME_OPTIONS.manual
    : [];

  return (
    <>
      <TopBar breadcrumbs={[{ label: 'Follow-up Center' }]} />
      <div className="page-content">
        <PageHeader
          title="Follow-up Center"
          description="Every candidate follow-up in one place, auto-scheduled across the three stages of the journey — pick a flow to focus."
        />

        <div className="fu-flow-cards">
          <button
            type="button"
            className={`fu-flow-card fu-flow-all${flow === 'all' ? ' active' : ''}`}
            onClick={() => setFlow('all')}
          >
            <div className="fu-flow-head">
              <span className="fu-flow-icon">📋</span>
              <span className="fu-flow-label">All flows</span>
              {(dueCounts.all ?? 0) > 0 && <span className="fu-flow-due">{dueCounts.all} due</span>}
            </div>
            <div className="fu-flow-tagline">Everything needing attention</div>
          </button>
          {FOLLOW_UP_FLOWS.map((fl) => (
            <button
              key={fl.id}
              type="button"
              className={`fu-flow-card fu-flow-${fl.id}${flow === fl.id ? ' active' : ''}`}
              onClick={() => setFlow(fl.id)}
            >
              <div className="fu-flow-head">
                <span className="fu-flow-icon">{fl.icon}</span>
                <span className="fu-flow-label">{fl.label}</span>
                {(dueCounts[fl.id] ?? 0) > 0 && (
                  <span className="fu-flow-due">{dueCounts[fl.id]} due</span>
                )}
              </div>
              <div className="fu-flow-tagline">{fl.tagline}</div>
              {fl.steps.length > 0 && (
                <div className="fu-flow-steps">
                  {fl.steps.map((s, i) => (
                    <span key={s} className="fu-flow-step">
                      {s}
                      {i < fl.steps.length - 1 && <span className="fu-flow-arrow">→</span>}
                    </span>
                  ))}
                </div>
              )}
            </button>
          ))}
        </div>

        <Tabs
          active={tab}
          onChange={setTab}
          tabs={TAB_IDS.map((id) => ({
            id,
            label: id.charAt(0).toUpperCase() + id.slice(1),
            count: tabCounts[id] ?? 0,
          }))}
        />

        <div className="follow-up-list">
          {filtered.map((f) => {
            const isBusy = busyId === f.id;
            const done = f.status === 'completed';
            const fl = flowOf(f);
            const step = milestoneLabel(f);
            const journey = journeySteps(f, followUps);
            const needsJoiningDate =
              f.category === 'offer_followup' &&
              f.milestone_day == null &&
              !f.candidate_expected_joining_at &&
              !done &&
              f.status !== 'missed';
            return (
              <div
                key={f.id}
                className={`follow-up-card${f.status === 'overdue' ? ' overdue' : ''}${f.escalated ? ' escalated' : ''}`}
              >
                <div className="follow-up-header">
                  <div className="follow-up-title">
                    {f.escalated && <span className="escalation-badge">🚨 Escalated</span>}
                    {f.status === 'overdue' && <span className="escalation-badge">⚠ Overdue</span>}
                    {f.status === 'missed' && <span className="escalation-badge">✕ Missed</span>}
                    <Link to={`/candidates/${f.candidate_id}`} className="follow-up-name">
                      {f.candidate_name}
                    </Link>
                    <span className="text-muted"> · {f.job_title || '—'}</span>
                  </div>
                  <span className="text-muted">{fmtDateTime(f.due_at)}</span>
                </div>

                <div className="fu-badges">
                  <span className={`fu-category-badge fu-cat-${f.category || 'manual'}`}>
                    {step || CATEGORY_LABELS[f.category || 'manual'] || f.category}
                  </span>
                  {f.interview_at && (
                    <span className="fu-milestone">
                      🗓 {f.interview_round || 'Interview'}: {fmtDateTime(f.interview_at)}
                    </span>
                  )}
                  {fl === 'post_selected' && f.candidate_expected_joining_at && (
                    <button
                      type="button"
                      className="fu-milestone fu-joining-chip"
                      title="Change expected joining date"
                      onClick={() => openSetJoiningDate(f)}
                    >
                      📅 Joining {fmtDate(f.candidate_expected_joining_at)} ✎
                    </button>
                  )}
                  {fl === 'post_joining' && f.candidate_joined_at && (
                    <span className="fu-milestone">🏁 Joined {fmtDate(f.candidate_joined_at)}</span>
                  )}
                  <span className="text-muted">
                    via {f.type}
                    {f.candidate_phone ? ` · 📱 ${f.candidate_phone}` : ''}
                  </span>
                </div>

                {journey && (
                  <div className="fu-journey">
                    {journey.map((s, i) => (
                      <span key={i} className={`fu-step ${s.state}`}>
                        <span className="fu-step-dot">
                          {s.state === 'done' ? '✓' : s.state === 'missed' ? '✕' : ''}
                        </span>
                        {s.label}
                      </span>
                    ))}
                  </div>
                )}

                {needsJoiningDate && (
                  <div className="fu-joining-cta">
                    <span>
                      No joining date yet — set it to auto-schedule the 1-week-before, 1-day-before
                      and joining-day reminders.
                    </span>
                    <button
                      type="button"
                      className="button-pill button-primary btn-sm"
                      onClick={() => openSetJoiningDate(f)}
                    >
                      📅 Set joining date
                    </button>
                  </div>
                )}

                {f.notes && <p className="follow-up-notes">{f.notes}</p>}
                {f.ai_suggestion && <div className="ai-chip">🤖 {f.ai_suggestion}</div>}

                {f.message_template && !done && (
                  <details className="fu-template">
                    <summary>
                      💬 Suggested message — {step || 'follow-up'}
                    </summary>
                    <pre className="fu-template-text">{f.message_template}</pre>
                    <div className="fu-template-actions">
                      <button type="button" className="button-pill button-secondary btn-sm" onClick={() => copyTemplate(f)}>
                        {copiedId === f.id ? '✓ Copied' : '📋 Copy'}
                      </button>
                      <button type="button" className="button-pill button-secondary btn-sm" onClick={() => whatsapp(f)}>
                        💬 Send via WhatsApp
                      </button>
                    </div>
                  </details>
                )}

                {!done && (
                  <div className="follow-up-actions">
                    <button type="button" className="button-pill button-secondary btn-sm" onClick={() => call(f)}>📞 Call</button>
                    <button type="button" className="button-pill button-secondary btn-sm" onClick={() => whatsapp(f)}>💬 WhatsApp</button>
                    <button type="button" className="button-pill button-secondary btn-sm" onClick={() => email(f)}>✉ Email</button>
                    <button
                      type="button"
                      className="button-pill button-primary btn-sm"
                      disabled={isBusy}
                      onClick={() => openComplete(f)}
                    >
                      ✓ Record outcome
                    </button>
                    {f.category !== 'onboarding' && (
                      <button type="button" className="button-pill button-secondary btn-sm" disabled={isBusy} onClick={() => openReschedule(f)}>
                        Reschedule
                      </button>
                    )}
                    {f.status !== 'missed' && (
                      <button type="button" className="button-pill button-secondary btn-sm" disabled={isBusy} onClick={() => markMissed(f.id)}>
                        Mark missed
                      </button>
                    )}
                  </div>
                )}
                {done && (
                  <div className="follow-up-done-tag">
                    ✓ Completed{f.outcome ? ` — ${OUTCOME_LABELS[f.outcome] || f.outcome}` : ''}
                    {f.completed_at ? ` · ${fmtDateTime(f.completed_at)}` : ''}
                  </div>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p className="empty-inline">
              {flow === 'all'
                ? 'No follow-ups here.'
                : `No ${FOLLOW_UP_FLOWS.find((fl) => fl.id === flow)?.label.toLowerCase()} follow-ups in this tab.`}
            </p>
          )}
        </div>
      </div>

      {completing && (
        <div className="modal-overlay" onClick={() => setCompleting(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 className="card-heading">Record follow-up outcome</h3>
            <p className="text-muted" style={{ marginBottom: '1rem' }}>
              {completing.candidate_name} · {milestoneLabel(completing) || CATEGORY_LABELS[completing.category || 'manual']}
            </p>
            <div className="fu-outcome-grid">
              {completingOptions.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className={`fu-outcome-option${outcome === o.id ? ' selected' : ''}${o.closes ? ' closes' : ''}`}
                  onClick={() => setOutcome(o.id)}
                >
                  {o.label}
                  {o.closes && <span className="fu-outcome-hint">stops future follow-ups</span>}
                </button>
              ))}
            </div>
            {outcome === 'no_answer' && ['interview_prep', 'interview_day', 'no_response'].includes(completing.category || '') && (
              <div className="ai-chip">🚨 An escalated retry (WhatsApp + call in 2 hours) will be created automatically.</div>
            )}
            {['connected', 'no_answer'].includes(outcome) && completing.category === 'offer_followup' && completing.milestone_day == null && (
              <div className="ai-chip">🔁 The next chase follow-up will be scheduled automatically in 3 days.</div>
            )}
            <label className="field-label" style={{ marginTop: '0.75rem' }}>Notes (optional)</label>
            <textarea
              className="input-field"
              rows={2}
              placeholder="What did the candidate say?"
              value={outcomeNote}
              onChange={(e) => setOutcomeNote(e.target.value)}
            />
            <div className="modal-actions">
              <button type="button" className="button-pill button-secondary" onClick={() => setCompleting(null)}>
                Cancel
              </button>
              <button type="button" className="button-pill button-primary" onClick={saveOutcome} disabled={!outcome || busyId === completing.id}>
                Save outcome
              </button>
            </div>
          </div>
        </div>
      )}

      {rescheduling && (
        <div className="modal-overlay" onClick={() => setRescheduling(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 className="card-heading">Reschedule follow-up</h3>
            <p className="text-muted" style={{ marginBottom: '1rem' }}>
              {rescheduling.candidate_name} · {rescheduling.type}
            </p>
            <label className="field-label">New due date &amp; time</label>
            <input
              type="datetime-local"
              className="input-field"
              value={rescheduleAt}
              onChange={(e) => setRescheduleAt(e.target.value)}
            />
            <div className="modal-actions">
              <button type="button" className="button-pill button-secondary" onClick={() => setRescheduling(null)}>
                Cancel
              </button>
              <button type="button" className="button-pill button-primary" onClick={saveReschedule} disabled={!rescheduleAt}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {settingDateFor && (
        <div className="modal-overlay" onClick={() => setSettingDateFor(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 className="card-heading">Expected joining date</h3>
            <p className="text-muted" style={{ marginBottom: '1rem' }}>
              {settingDateFor.candidate_name} · {settingDateFor.job_title || '—'}
            </p>
            <label className="field-label">Joining date</label>
            <input
              type="date"
              className="input-field"
              value={joiningDate}
              onChange={(e) => setJoiningDate(e.target.value)}
            />
            <div className="ai-chip" style={{ marginTop: '0.75rem' }}>
              🤖 Saving this schedules reminders automatically: 1 week before, 1 day before and on
              the joining day.
            </div>
            <div className="modal-actions">
              <button type="button" className="button-pill button-secondary" onClick={() => setSettingDateFor(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="button-pill button-primary"
                onClick={saveJoiningDate}
                disabled={!joiningDate || busyId === settingDateFor.id}
              >
                Save &amp; schedule
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
