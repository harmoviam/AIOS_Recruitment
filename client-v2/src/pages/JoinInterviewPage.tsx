import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import InterviewVideoRoom, { type VideoSession } from '../components/InterviewVideoRoom';

export default function JoinInterviewPage() {
  const { joinToken } = useParams<{ joinToken: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    candidateName: string;
    tenantName: string;
    scheduledAt: string;
    roundType: string;
    livekitConfigured: boolean;
  } | null>(null);
  const [name, setName] = useState('');
  const [session, setSession] = useState<VideoSession | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!joinToken) return;
    setLoading(true);
    api
      .getInterviewJoinPreview(joinToken)
      .then((data) => {
        setPreview(data);
        setName(data.candidateName || '');
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [joinToken]);

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinToken) return;
    setJoining(true);
    setError(null);
    try {
      const res = await api.getInterviewGuestToken(joinToken, name.trim());
      setSession({
        serverUrl: res.serverUrl,
        token: res.token,
        roomName: res.roomName,
        participantName: res.participantName,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join');
    } finally {
      setJoining(false);
    }
  };

  if (session && preview) {
    return (
      <InterviewVideoRoom
        session={session}
        title={`${preview.roundType} Interview`}
        subtitle={`${preview.tenantName} · ${new Date(preview.scheduledAt).toLocaleString()}`}
        onLeave={() => setSession(null)}
      />
    );
  }

  return (
    <div className="join-interview-page">
      <div className="card join-interview-card">
        {loading ? (
          <p className="text-muted">Loading interview…</p>
        ) : error && !preview ? (
          <>
            <h1 className="section-title">Interview link unavailable</h1>
            <p className="text-muted">{error}</p>
          </>
        ) : preview ? (
          <>
            <p className="join-interview-badge">{preview.tenantName}</p>
            <h1 className="section-title">Join your interview</h1>
            <p className="section-description">
              {preview.roundType} · {new Date(preview.scheduledAt).toLocaleString()}
            </p>

            {!preview.livekitConfigured ? (
              <p className="interview-video-error" style={{ marginTop: '1rem' }}>
                Video calling is not configured on this server yet. Please contact your recruiter.
              </p>
            ) : (
              <form onSubmit={join} style={{ marginTop: '1.25rem' }}>
                <label className="join-interview-label" htmlFor="participant-name">
                  Your name
                </label>
                <input
                  id="participant-name"
                  className="input-field"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your full name"
                  required
                  maxLength={80}
                  autoFocus
                />
                {error && <p className="interview-video-error">{error}</p>}
                <button
                  type="submit"
                  className="button-pill button-primary"
                  style={{ marginTop: '1rem', width: '100%' }}
                  disabled={joining || !name.trim()}
                >
                  {joining ? 'Joining…' : 'Join video call'}
                </button>
              </form>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
