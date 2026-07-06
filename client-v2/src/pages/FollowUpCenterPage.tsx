import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import TopBar from '../components/ui/TopBar';
import PageHeader from '../components/ui/PageHeader';
import Tabs from '../components/ui/Tabs';
import { FOLLOW_UP_CATEGORIES, type FollowUp } from '../types';

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
  joined_elsewhere: 'Joined elsewhere',
  doing_well: 'Doing well',
  issue_flagged: 'Issue flagged',
  left_company: 'Left company',
  done: 'Done',
  auto_closed: 'Auto-closed',
};

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

export default function FollowUpCenterPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<string>('today');
  const [category, setCategory] = useState<string>('all');
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [rescheduling, setRescheduling] = useState<FollowUp | null>(null);
  const [rescheduleAt, setRescheduleAt] = useState('');
  const [completing, setCompleting] = useState<FollowUp | null>(null);
  const [outcome, setOutcome] = useState('');
  const [outcomeNote, setOutcomeNote] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = () => {
    api.getFollowUps().then(setFollowUps);
    api.getFollowUpCounts().then(setCounts);
  };

  useEffect(() => {
    load();
  }, []);

  const tabFiltered = useMemo(
    () =>
      tab === 'today'
        ? followUps.filter((f) => f.status === 'today' || f.status === 'overdue')
        : followUps.filter((f) => f.status === tab),
    [followUps, tab]
  );

  const categoryCounts = useMemo(() => {
    const acc: Record<string, number> = { all: tabFiltered.length };
    for (const f of tabFiltered) {
      const c = f.category || 'manual';
      acc[c] = (acc[c] || 0) + 1;
    }
    return acc;
  }, [tabFiltered]);

  const filtered = useMemo(
    () => (category === 'all' ? tabFiltered : tabFiltered.filter((f) => (f.category || 'manual') === category)),
    [tabFiltered, category]
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
    navigate(`/messages?candidate=${f.candidate_id}`);
  };

  const email = (f: FollowUp) => {
    if (f.candidate_email) {
      const subject = encodeURIComponent(`Regarding ${f.job_title || 'your application'}`);
      window.location.href = `mailto:${f.candidate_email}?subject=${subject}`;
    } else {
      alert('No email on file for this candidate.');
    }
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

  const completingOptions = completing
    ? OUTCOME_OPTIONS[completing.category || 'manual'] || OUTCOME_OPTIONS.manual
    : [];

  return (
    <>
      <TopBar breadcrumbs={[{ label: 'Follow-up Center' }]} />
      <div className="page-content">
        <PageHeader
          title="Follow-up Center"
          description="Auto-generated from your pipeline: interview reminders (day before & same day), selected-to-joining chase, no-answer escalations, and post-joining check-ins on day 7 / 30 / 45 / 80 / 91."
        />

        <Tabs
          active={tab}
          onChange={setTab}
          tabs={TAB_IDS.map((id) => ({
            id,
            label: id.charAt(0).toUpperCase() + id.slice(1),
            count: counts[id] ?? 0,
          }))}
        />

        <div className="fu-category-chips">
          <button
            type="button"
            className={`fu-chip${category === 'all' ? ' active' : ''}`}
            onClick={() => setCategory('all')}
          >
            All <span className="fu-chip-count">{categoryCounts.all ?? 0}</span>
          </button>
          {FOLLOW_UP_CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`fu-chip${category === c.id ? ' active' : ''}`}
              title={c.hint}
              onClick={() => setCategory(c.id)}
            >
              {c.label} <span className="fu-chip-count">{categoryCounts[c.id] ?? 0}</span>
            </button>
          ))}
        </div>

        <div className="follow-up-list">
          {filtered.map((f) => {
            const isBusy = busyId === f.id;
            const done = f.status === 'completed';
            const cat = f.category || 'manual';
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
                  <span className="text-muted">
                    {new Date(f.due_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                </div>

                <div className="fu-badges">
                  <span className={`fu-category-badge fu-cat-${cat}`}>{CATEGORY_LABELS[cat] || cat}</span>
                  {f.milestone_day != null && <span className="fu-milestone">Day {f.milestone_day}</span>}
                  {f.interview_at && (
                    <span className="fu-milestone">
                      🗓 {f.interview_round || 'Interview'}: {new Date(f.interview_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                    </span>
                  )}
                  <span className="text-muted">via {f.type}{f.candidate_phone ? ` · 📱 ${f.candidate_phone}` : ''}</span>
                </div>

                {f.notes && <p className="follow-up-notes">{f.notes}</p>}
                {f.ai_suggestion && <div className="ai-chip">🤖 {f.ai_suggestion}</div>}

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
                    <button type="button" className="button-pill button-secondary btn-sm" disabled={isBusy} onClick={() => openReschedule(f)}>
                      Reschedule
                    </button>
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
                    {f.completed_at ? ` · ${new Date(f.completed_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}` : ''}
                  </div>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && <p className="empty-inline">No follow-ups in this category.</p>}
        </div>
      </div>

      {completing && (
        <div className="modal-overlay" onClick={() => setCompleting(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 className="card-heading">Record follow-up outcome</h3>
            <p className="text-muted" style={{ marginBottom: '1rem' }}>
              {completing.candidate_name} · {CATEGORY_LABELS[completing.category || 'manual']}
              {completing.milestone_day != null && ` · Day ${completing.milestone_day}`}
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
            {['connected', 'no_answer'].includes(outcome) && completing.category === 'offer_followup' && (
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
    </>
  );
}
