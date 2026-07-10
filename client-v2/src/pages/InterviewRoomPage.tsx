import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import InterviewEvaluationPanel from '../components/InterviewEvaluationPanel';
import InterviewVideoRoom, { type VideoSession } from '../components/InterviewVideoRoom';
import { useAuth } from '../context/AuthContext';
import type { InterviewEvaluation } from '../types';

export default function InterviewRoomPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<VideoSession | null>(null);
  const [showScorecard, setShowScorecard] = useState(true);
  const [meta, setMeta] = useState<{
    candidateName: string;
    scheduledAt: string;
    roundType: string;
    meetingLink?: string;
    evaluation?: InterviewEvaluation | null;
  } | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api
      .getInterviewVideoToken(Number(id))
      .then((res) => {
        setSession({
          serverUrl: res.serverUrl,
          token: res.token,
          roomName: res.roomName,
          participantName: res.participantName,
        });
        setMeta({
          candidateName: res.interview.candidateName,
          scheduledAt: res.interview.scheduledAt,
          roundType: res.interview.roundType,
          meetingLink: res.interview.meetingLink,
          evaluation: res.interview.evaluation,
        });
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <div className="interview-video-loading">Connecting to interview room…</div>;
  }

  if (error) {
    return (
      <div className="interview-video-page">
        <div className="card interview-video-card">
          <h1 className="section-title">Unable to join</h1>
          <p className="text-muted">{error}</p>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <button type="button" className="button-pill button-secondary" onClick={() => navigate('/interviews')}>
              Back to interviews
            </button>
            {meta?.meetingLink && (
              <button
                type="button"
                className="button-pill button-primary"
                onClick={() => navigator.clipboard.writeText(meta.meetingLink!)}
              >
                Copy candidate link
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!session || !meta || !id) return null;

  return (
    <div className={`interview-room-layout${showScorecard ? ' with-scorecard' : ''}`}>
      <div className="interview-room-video">
        <InterviewVideoRoom
          session={session}
          title={`${meta.roundType} — ${meta.candidateName}`}
          subtitle={`${new Date(meta.scheduledAt).toLocaleString()} · Host: ${user?.name || 'Recruiter'}`}
          onLeave={() => navigate('/interviews')}
          headerExtra={
            <button
              type="button"
              className={`button-pill ${showScorecard ? 'button-primary' : 'button-secondary'}`}
              onClick={() => setShowScorecard((v) => !v)}
            >
              {showScorecard ? 'Hide scorecard' : 'Show scorecard'}
            </button>
          }
        />
      </div>
      {showScorecard && (
        <aside className="interview-room-scorecard">
          <InterviewEvaluationPanel
            interviewId={Number(id)}
            candidateName={meta.candidateName}
            initialEvaluation={meta.evaluation}
            compact
            onSaved={(evaluation) => setMeta((prev) => (prev ? { ...prev, evaluation } : prev))}
          />
        </aside>
      )}
    </div>
  );
}
