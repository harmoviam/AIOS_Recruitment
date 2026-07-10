import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import InterviewVideoRoom, { type VideoSession } from '../components/InterviewVideoRoom';
import { useAuth } from '../context/AuthContext';

export default function InterviewRoomPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<VideoSession | null>(null);
  const [meta, setMeta] = useState<{
    candidateName: string;
    scheduledAt: string;
    roundType: string;
    meetingLink?: string;
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

  if (!session || !meta) return null;

  return (
    <InterviewVideoRoom
      session={session}
      title={`${meta.roundType} — ${meta.candidateName}`}
      subtitle={`${new Date(meta.scheduledAt).toLocaleString()} · Host: ${user?.name || 'Recruiter'}`}
      onLeave={() => navigate('/interviews')}
    />
  );
}
