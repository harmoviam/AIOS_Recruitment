import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import Tabs from '../components/ui/Tabs';
import type { Candidate, Interview, Message, TimelineEvent } from '../types';

const DETAIL_TABS = [
  { id: 'profile', label: 'Profile' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'communication', label: 'Communication' },
  { id: 'interviews', label: 'Interviews' },
  { id: 'notes', label: 'Notes' },
  { id: 'ai', label: 'AI Insights' },
];

const TIMELINE_SOURCE_LABELS: Record<TimelineEvent['source'], string> = {
  activity: 'Activity',
  message: 'Message',
  interview: 'Interview',
  follow_up: 'Follow-up',
};

function timelineSummary(ev: TimelineEvent) {
  return ev.description || ev.content || ev.type || '—';
}

function timelineActor(ev: TimelineEvent) {
  if (ev.actor_name) return ev.actor_name;
  if (ev.source === 'message' && ev.is_outgoing === false) return ev.sender || 'Candidate';
  return null;
}

export default function CandidateDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [tab, setTab] = useState('profile');
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!id) return;
    const cid = Number(id);
    api.getCandidate(cid).then((c) => {
      setCandidate(c);
      setNotes(c.notes || '');
    });
    api.getInterviews({ candidate_id: String(cid) }).then(setInterviews);
    api.getMessages(cid).then(setMessages);
    api.getCandidateTimeline(cid).then(setTimeline);
    api.getCandidateSuggestions(cid).then((r) => setSuggestions(r.suggestions));
  }, [id]);

  if (!candidate) return <div className="page-content">Loading…</div>;

  const skills = Array.isArray(candidate.skills) ? candidate.skills : [];

  const saveNotes = async () => {
    await api.updateCandidate(candidate.id, { notes });
  };

  const toggleHot = async () => {
    const updated = await api.updateCandidate(candidate.id, { is_hot: !candidate.is_hot });
    setCandidate(updated);
  };

  return (
    <>
      <div className="topbar">
        <button type="button" className="button-pill button-secondary" onClick={() => navigate(-1)}>
          ← Back
        </button>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            className={`button-pill ${candidate.is_hot ? 'button-primary' : 'button-secondary'}`}
            onClick={toggleHot}
            title={candidate.is_hot ? 'Remove hot candidate flag' : 'Mark when you are confident this candidate will attend and join'}
          >
            {candidate.is_hot ? '🔥 Hot Candidate' : '🔥 Mark as Hot'}
          </button>
          <Link to={`/interviews?candidate=${candidate.id}`} className="button-pill button-primary">
            Schedule Interview
          </Link>
          <Link to={`/messages?candidate=${candidate.id}&from=${encodeURIComponent(location.pathname)}`} className="button-pill button-secondary">
            WhatsApp
          </Link>
        </div>
      </div>
      <div className="page-content candidate-detail">
        <div className="detail-header">
          <div>
            <h1 className="section-title">
              {candidate.name}
              {candidate.is_hot && <span className="hot-flame" title="Hot candidate">🔥</span>}
            </h1>
            <p className="section-description">
              {candidate.job_title || 'Unassigned'} • {candidate.experience_years} yrs experience
            </p>
          </div>
          <div className="ai-score-large">{candidate.ai_score}</div>
        </div>

        <Tabs tabs={DETAIL_TABS} active={tab} onChange={setTab} />

        {tab === 'profile' && (
          <div className="section-split">
            <div>
              <div className="card" style={{ marginBottom: '1rem' }}>
                <div className="card-title">Contact</div>
                <p>{candidate.email || '—'}</p>
                <p>{candidate.phone || '—'}</p>
                <p>Recruiter: {candidate.recruiter_name || '—'}</p>
                <p>Salary: {candidate.salary_expectation || '—'}</p>
              </div>
              <div className="card">
                <div className="card-title">Skills</div>
                <div className="candidate-skills">
                  {skills.map((s) => (
                    <div key={s} className="skill-tag">{s}</div>
                  ))}
                </div>
              </div>
            </div>
            <div className="card">
              <div className="card-title">Stage</div>
              <p className="text-muted">
                Current: <strong>{candidate.stage}</strong>
                {candidate.offer_status && (
                  <> · Outcome: <strong>{candidate.offer_status.replace(/_/g, ' ')}</strong></>
                )}
              </p>
            </div>
          </div>
        )}

        {tab === 'timeline' && (
          <div className="card">
            {timeline.length === 0 ? (
              <p className="text-muted">No activity yet.</p>
            ) : (
              timeline.map((ev) => {
                const actor = timelineActor(ev);
                return (
                  <div key={`${ev.source}-${ev.id}`} className="schedule-slot timeline-event">
                    <div className="slot-info">
                      <div className="slot-time">{new Date(ev.created_at).toLocaleString()}</div>
                      <div className="slot-candidate">
                        <span className="text-muted">{TIMELINE_SOURCE_LABELS[ev.source]}</span>
                        {' · '}
                        {timelineSummary(ev)}
                      </div>
                      {actor && (
                        <div className="timeline-actor">
                          {ev.source === 'message' && ev.is_outgoing === false ? 'From' : 'By'} {actor}
                        </div>
                      )}
                    </div>
                    {ev.status && <span className="slot-status">{ev.status}</span>}
                  </div>
                );
              })
            )}
          </div>
        )}

        {tab === 'communication' && (
          <div className="card">
            {messages.length === 0 ? (
              <p className="text-muted">No messages yet.</p>
            ) : (
              messages.map((m) => (
                <div key={m.id} className={`suggestion-item${m.is_outgoing ? '' : ' inbound'}`}>
                  <strong>{m.sender}</strong> · {new Date(m.sent_at).toLocaleString()}
                  <br />{m.content}
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'interviews' && (
          <div className="card">
            {interviews.length === 0 ? (
              <p className="text-muted">No interviews yet</p>
            ) : (
              interviews.map((iv) => (
                <div key={iv.id} className="schedule-slot">
                  <div className="slot-info">
                    <div className="slot-time">{new Date(iv.scheduled_at).toLocaleString()}</div>
                    <div className="slot-candidate">
                      {iv.round_type} • {iv.status}
                      {iv.score != null ? ` • Score ${iv.score}/10` : ''}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'notes' && (
          <div className="card">
            <textarea
              className="input-field"
              rows={6}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add recruiter notes…"
            />
            <button type="button" className="button-pill button-primary" style={{ marginTop: '0.75rem' }} onClick={saveNotes}>
              Save Notes
            </button>
          </div>
        )}

        {tab === 'ai' && (
          <div className="card">
            {candidate.salary_expectation && (
              <div className="suggestion-item">
                <strong>Salary expectation</strong><br />{candidate.salary_expectation}
              </div>
            )}
            {suggestions.map((s) => (
              <div key={s} className="suggestion-item">{s}</div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
