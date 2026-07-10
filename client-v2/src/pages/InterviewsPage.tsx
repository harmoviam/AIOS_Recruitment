import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import type { Candidate, Interview } from '../types';

type ViewMode = 'calendar' | 'list';

function toDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** All cells for a month grid: leading/trailing days pad to full weeks (Sun–Sat). */
function monthGridDays(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const days: Date[] = [];
  const cursor = new Date(start);
  do {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  } while (cursor.getMonth() === month || days.length % 7 !== 0);
  return days;
}

export default function InterviewsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [view, setView] = useState<ViewMode>('calendar');
  const today = new Date();
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [selectedDay, setSelectedDay] = useState<string>(toDateKey(today));
  const [form, setForm] = useState({
    candidate_id: searchParams.get('candidate') || '',
    scheduled_at: '',
    round_type: 'Technical',
  });
  const [copyStatus, setCopyStatus] = useState<number | null>(null);

  const load = () => api.getInterviews().then(setInterviews);

  useEffect(() => {
    load();
    api.getCandidates().then(setCandidates);
  }, []);

  const byDay = useMemo(() => {
    const map = new Map<string, Interview[]>();
    for (const iv of interviews) {
      const key = toDateKey(new Date(iv.scheduled_at));
      map.set(key, [...(map.get(key) || []), iv]);
    }
    for (const list of map.values()) {
      list.sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
    }
    return map;
  }, [interviews]);

  const todayInterviews = byDay.get(toDateKey(today)) || [];
  const selectedInterviews = byDay.get(selectedDay) || [];
  const gridDays = useMemo(() => monthGridDays(cursor.year, cursor.month), [cursor]);
  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleString('default', {
    month: 'long',
    year: 'numeric',
  });

  const moveMonth = (delta: number) => {
    const d = new Date(cursor.year, cursor.month + delta, 1);
    setCursor({ year: d.getFullYear(), month: d.getMonth() });
  };

  const pickDay = (day: Date) => {
    setSelectedDay(toDateKey(day));
    if (day.getMonth() !== cursor.month) {
      setCursor({ year: day.getFullYear(), month: day.getMonth() });
    }
  };

  const openFormForSelectedDay = () => {
    const [y, m, d] = selectedDay.split('-').map(Number);
    const prefill = new Date(y, m - 1, d, 10, 0);
    const pad = (n: number) => String(n).padStart(2, '0');
    setForm((f) => ({
      ...f,
      scheduled_at: `${prefill.getFullYear()}-${pad(prefill.getMonth() + 1)}-${pad(prefill.getDate())}T${pad(prefill.getHours())}:${pad(prefill.getMinutes())}`,
    }));
    setShowForm(true);
  };

  const schedule = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.createInterview({
      candidate_id: Number(form.candidate_id),
      scheduled_at: new Date(form.scheduled_at).toISOString(),
      round_type: form.round_type,
      status: 'pending',
    });
    setShowForm(false);
    load();
  };

  const updateStatus = async (id: number, status: string) => {
    await api.updateInterview(id, { status });
    load();
  };

  const copyCandidateLink = async (iv: Interview) => {
    if (!iv.meeting_link) return;
    await navigator.clipboard.writeText(iv.meeting_link);
    setCopyStatus(iv.id);
    window.setTimeout(() => setCopyStatus((current) => (current === iv.id ? null : current)), 2000);
  };

  const slotRow = (iv: Interview) => (
    <div key={iv.id} className="schedule-slot">
      <div className="slot-info">
        <div className="slot-time">{new Date(iv.scheduled_at).toLocaleString()}</div>
        <div className="slot-candidate">
          {iv.candidate_name} • {iv.round_type}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <span className={`slot-status ${iv.status === 'pending' ? 'pending' : ''}`}>{iv.status}</span>
        <button
          type="button"
          className="button-pill button-primary"
          onClick={() => navigate(`/interviews/${iv.id}/room`)}
        >
          Join call
        </button>
        {iv.meeting_link && (
          <button type="button" className="button-pill button-secondary" onClick={() => copyCandidateLink(iv)}>
            {copyStatus === iv.id ? 'Copied!' : 'Copy candidate link'}
          </button>
        )}
        {iv.status === 'pending' && (
          <button type="button" className="button-pill button-secondary" onClick={() => updateStatus(iv.id, 'confirmed')}>
            Confirm
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      <div className="topbar">
        <div className="search-bar">
          {today.toLocaleString('default', { month: 'long', year: 'numeric' })} • {todayInterviews.length} interviews today
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            className={`button-pill ${view === 'calendar' ? 'button-primary' : 'button-secondary'}`}
            onClick={() => setView('calendar')}
          >
            Calendar
          </button>
          <button
            type="button"
            className={`button-pill ${view === 'list' ? 'button-primary' : 'button-secondary'}`}
            onClick={() => setView('list')}
          >
            List
          </button>
          <button type="button" className="button-pill button-primary" onClick={() => setShowForm(!showForm)}>
            + Schedule
          </button>
        </div>
      </div>
      <div className="page-content">
        <h1 className="section-title">Interview Scheduling</h1>
        <p className="section-description">Calendar view with LiveKit video rooms and shareable candidate links.</p>

        {showForm && (
          <form className="card" style={{ marginBottom: '1.5rem' }} onSubmit={schedule}>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
              <select className="input-field" value={form.candidate_id} onChange={(e) => setForm({ ...form, candidate_id: e.target.value })} required>
                <option value="">Select candidate</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <input type="datetime-local" className="input-field" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} required />
              <input className="input-field" placeholder="Round type" value={form.round_type} onChange={(e) => setForm({ ...form, round_type: e.target.value })} />
              <p className="text-muted" style={{ gridColumn: '1 / -1', margin: 0, fontSize: '0.9rem' }}>
                A secure candidate join link is created automatically when you save.
              </p>
            </div>
            <button type="submit" className="button-pill button-primary" style={{ marginTop: '1rem' }}>Save interview</button>
          </form>
        )}

        {view === 'calendar' ? (
          <div className="section-split">
            <div className="card">
              <div className="calendar-toolbar">
                <button type="button" className="button-pill button-secondary" onClick={() => moveMonth(-1)} aria-label="Previous month">
                  ‹
                </button>
                <div className="calendar-month-label">{monthLabel}</div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    className="button-pill button-secondary"
                    onClick={() => {
                      setCursor({ year: today.getFullYear(), month: today.getMonth() });
                      setSelectedDay(toDateKey(today));
                    }}
                  >
                    Today
                  </button>
                  <button type="button" className="button-pill button-secondary" onClick={() => moveMonth(1)} aria-label="Next month">
                    ›
                  </button>
                </div>
              </div>
              <div className="calendar-grid calendar-weekdays">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                  <div key={d} className="calendar-weekday">{d}</div>
                ))}
              </div>
              <div className="calendar-grid">
                {gridDays.map((day) => {
                  const key = toDateKey(day);
                  const dayInterviews = byDay.get(key) || [];
                  const classes = [
                    'calendar-day',
                    'calendar-day-cell',
                    day.getMonth() !== cursor.month ? 'outside' : '',
                    key === toDateKey(today) ? 'today' : '',
                    key === selectedDay ? 'selected' : '',
                  ]
                    .filter(Boolean)
                    .join(' ');
                  return (
                    <button type="button" key={key} className={classes} onClick={() => pickDay(day)}>
                      <span className="calendar-day-number">{day.getDate()}</span>
                      <span className="calendar-day-events">
                        {dayInterviews.slice(0, 2).map((iv) => (
                          <span key={iv.id} className={`calendar-event ${iv.status === 'pending' ? 'pending' : ''}`}>
                            {new Date(iv.scheduled_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}{' '}
                            {iv.candidate_name}
                          </span>
                        ))}
                        {dayInterviews.length > 2 && (
                          <span className="calendar-event-more">+{dayInterviews.length - 2} more</span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <div className="card" style={{ marginBottom: '1rem' }}>
                <div className="card-title">
                  {(() => {
                    const [y, m, d] = selectedDay.split('-').map(Number);
                    return new Date(y, m - 1, d).toLocaleDateString('default', { weekday: 'long', month: 'long', day: 'numeric' });
                  })()}
                </div>
                {selectedInterviews.length === 0 ? (
                  <p className="text-muted" style={{ marginTop: '0.5rem' }}>No interviews on this day.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginTop: '0.75rem' }}>
                    {selectedInterviews.map(slotRow)}
                  </div>
                )}
                <button type="button" className="button-pill button-secondary" style={{ marginTop: '0.9rem' }} onClick={openFormForSelectedDay}>
                  + Schedule on this day
                </button>
              </div>
              <div className="card">
                <div className="card-title">AI Scheduling Tips</div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6, marginTop: '0.75rem' }}>
                  Prefer Tuesday–Thursday 10 AM–2 PM slots for highest confirmation rates. Morning slots show 90% acceptance for tech roles.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="section-split">
            <div>
              {interviews.length === 0 ? (
                <div className="empty-inline">No interviews scheduled yet.</div>
              ) : (
                interviews.map(slotRow)
              )}
            </div>
            <div>
              <div className="card">
                <div className="card-title">AI Scheduling Tips</div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6, marginTop: '0.75rem' }}>
                  Prefer Tuesday–Thursday 10 AM–2 PM slots for highest confirmation rates. Morning slots show 90% acceptance for tech roles.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
