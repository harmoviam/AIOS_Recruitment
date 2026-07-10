import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import InterviewEvaluationPanel from '../components/InterviewEvaluationPanel';
import InterviewVideoRoom, { type VideoSession } from '../components/InterviewVideoRoom';
import { useAuth } from '../context/AuthContext';
import type { Interview, InterviewEvaluation } from '../types';

export default function InterviewRoomPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [session, setSession] = useState<VideoSession | null>(null);
  const [showScorecard, setShowScorecard] = useState(true);
  const [interview, setInterview] = useState<Interview | null>(null);

  useEffect(() => {
    if (!id) return;
    const interviewId = Number(id);
    setLoading(true);
    setVideoError(null);
    setSession(null);

    Promise.all([
      api.getInterview(interviewId),
      api.getInterviewVideoToken(interviewId).catch((e: Error) => {
        setVideoError(e.message);
        return null;
      }),
    ])
      .then(([iv, video]) => {
        setInterview(iv);
        if (video) {
          setSession({
            serverUrl: video.serverUrl,
            token: video.token,
            roomName: video.roomName,
            participantName: video.participantName,
          });
          if (video.interview.evaluation) {
            setInterview((prev) => (prev ? { ...prev, evaluation: video.interview.evaluation } : prev));
          }
        }
      })
      .catch((e: Error) => setVideoError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  const onSaved = (evaluation: InterviewEvaluation) => {
    setInterview((prev) =>
      prev ? { ...prev, evaluation, score: evaluation.overall_score ?? prev.score, status: 'completed' } : prev
    );
  };

  if (loading) {
    return <div className="interview-video-loading">Loading interview…</div>;
  }

  if (!interview || !id) {
    return (
      <div className="interview-video-page">
        <div className="card interview-video-card">
          <h1 className="section-title">Interview not found</h1>
          <p className="text-muted">{videoError || 'Unable to load this interview.'}</p>
          <button type="button" className="button-pill button-secondary" onClick={() => navigate('/interviews')}>
            Back to interviews
          </button>
        </div>
      </div>
    );
  }

  const meta = {
    candidateName: interview.candidate_name || 'Candidate',
    scheduledAt: interview.scheduled_at,
    roundType: interview.round_type,
    meetingLink: interview.meeting_link,
    evaluation: interview.evaluation,
  };

  // Video unavailable — still show the full screening scorecard (common in prod without LiveKit).
  if (!session) {
    return (
      <div className="interview-screening-only-page">
        <div className="topbar interview-screening-topbar">
          <button type="button" className="button-pill button-secondary" onClick={() => navigate('/interviews')}>
            ← Back to Calendar
          </button>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <Link to={`/candidates/${interview.candidate_id}`} className="button-pill button-secondary">
              Candidate profile
            </Link>
            {interview.meeting_link && (
              <button
                type="button"
                className="button-pill button-secondary"
                onClick={() => navigator.clipboard.writeText(interview.meeting_link!)}
              >
                Copy candidate link
              </button>
            )}
          </div>
        </div>
        <div className="page-content">
          {videoError && (
            <div className="alert-banner warning" style={{ marginBottom: '1rem' }}>
              Video call unavailable: {videoError}. You can still run the interview screening below.
            </div>
          )}
          <h1 className="section-title">Interview Screening</h1>
          <p className="section-description">
            {meta.candidateName} · {meta.roundType} · {new Date(meta.scheduledAt).toLocaleString()}
          </p>
          <div className="card">
            <InterviewEvaluationPanel
              interviewId={Number(id)}
              candidateName={meta.candidateName}
              initialEvaluation={meta.evaluation}
              onSaved={onSaved}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`interview-room-layout${showScorecard ? ' with-scorecard' : ''}`}>
      <div className="interview-room-video">
        <InterviewVideoRoom
          session={session}
          title={`${meta.roundType} — ${meta.candidateName}`}
          subtitle={`${new Date(meta.scheduledAt).toLocaleString()} · Host: ${user?.name || 'Recruiter'}`}
          onLeave={() => navigate('/interviews')}
          headerExtra={
            <>
              <Link to={`/interviews/${id}/evaluate`} className="button-pill button-secondary">
                Full scorecard
              </Link>
              <button
                type="button"
                className={`button-pill ${showScorecard ? 'button-primary' : 'button-secondary'}`}
                onClick={() => setShowScorecard((v) => !v)}
              >
                {showScorecard ? 'Hide scorecard' : 'Show scorecard'}
              </button>
            </>
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
            onSaved={onSaved}
          />
        </aside>
      )}
    </div>
  );
}
