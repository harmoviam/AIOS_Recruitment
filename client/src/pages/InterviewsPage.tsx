import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import type { Candidate, Interview } from '../types';

export default function InterviewsPage() {
  const [searchParams] = useSearchParams();
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    candidate_id: searchParams.get('candidate') || '',
    scheduled_at: '',
    round_type: 'Technical',
    meeting_link: 'https://zoom.us/j/new',
  });

  const load = () => api.getInterviews().then(setInterviews);

  useEffect(() => {
    load();
    api.getCandidates().then(setCandidates);
  }, []);

  const today = new Date();
  const todayInterviews = interviews.filter(
    (i) => new Date(i.scheduled_at).toDateString() === today.toDateString()
  );

  const schedule = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.createInterview({
      candidate_id: Number(form.candidate_id),
      scheduled_at: new Date(form.scheduled_at).toISOString(),
      round_type: form.round_type,
      meeting_link: form.meeting_link,
      status: 'pending',
    });
    setShowForm(false);
    load();
  };

  const updateStatus = async (id: number, status: string) => {
    await api.updateInterview(id, { status });
    load();
  };

  return (
    <>
      <div className="topbar">
        <div className="search-bar">
          {today.toLocaleString('default', { month: 'long', year: 'numeric' })} • {todayInterviews.length} interviews today
        </div>
        <button type="button" className="button-pill button-primary" onClick={() => setShowForm(!showForm)}>
          + Schedule
        </button>
      </div>
      <div className="page-content">
        <h1 className="section-title">Interview Scheduling</h1>
        <p className="section-description">Calendar view with slots and meeting links.</p>

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
              <input className="input-field" placeholder="Meeting link" value={form.meeting_link} onChange={(e) => setForm({ ...form, meeting_link: e.target.value })} />
            </div>
            <button type="submit" className="button-pill button-primary" style={{ marginTop: '1rem' }}>Save interview</button>
          </form>
        )}

        <div className="section-split">
          <div>
            {interviews.map((iv) => (
              <div key={iv.id} className="schedule-slot">
                <div className="slot-info">
                  <div className="slot-time">{new Date(iv.scheduled_at).toLocaleString()}</div>
                  <div className="slot-candidate">
                    {iv.candidate_name} • {iv.round_type}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <span className={`slot-status ${iv.status === 'pending' ? 'pending' : ''}`}>{iv.status}</span>
                  {iv.meeting_link && (
                    <a href={iv.meeting_link} target="_blank" rel="noreferrer" className="button-pill button-primary">
                      Join
                    </a>
                  )}
                  {iv.status === 'pending' && (
                    <button type="button" className="button-pill button-secondary" onClick={() => updateStatus(iv.id, 'confirmed')}>
                      Confirm
                    </button>
                  )}
                </div>
              </div>
            ))}
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
      </div>
    </>
  );
}
