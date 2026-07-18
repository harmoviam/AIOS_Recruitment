import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import type { PollSummary } from '../../types';
import { pollPath } from '../../utils/pollSession';
import PollShell from './PollShell';

export default function PollListPage() {
  const { tenantSlug = '' } = useParams();
  const navigate = useNavigate();
  const [tenantName, setTenantName] = useState('');
  const [polls, setPolls] = useState<PollSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!tenantSlug) {
      navigate('/poll', { replace: true });
      return;
    }
    api
      .pollGetMeta(tenantSlug)
      .then((meta) => {
        setTenantName(meta.name);
        setPolls(meta.polls || []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Workspace not found'))
      .finally(() => setLoading(false));
  }, [tenantSlug, navigate]);

  return (
    <PollShell subtitle="Choose an open poll" tenantSlug={tenantSlug} tenantName={tenantName}>
      <div className="poll-card poll-card--narrow">
        {loading ? (
          <div className="poll-loading">
            <span className="login-spinner" aria-hidden />
            Loading polls…
          </div>
        ) : error ? (
          <div>
            <p className="form-error">{error}</p>
            <Link to="/poll" className="button-pill button-secondary">
              Choose another workspace
            </Link>
          </div>
        ) : (
          <>
            <h1 className="poll-title">Open polls</h1>
            <p className="poll-lead">
              Select a poll for {tenantName || 'this organization'} to register and take the assessment.
            </p>
            {polls.length === 0 ? (
              <p className="text-muted">No open polls are available right now. Please check back later.</p>
            ) : (
              <div className="poll-workspace-list">
                {polls.map((poll) => (
                  <Link key={poll.id} to={pollPath(tenantSlug, poll.slug)} className="poll-workspace-item">
                    <span className="poll-workspace-mark" aria-hidden>
                      {poll.title.slice(0, 2).toUpperCase()}
                    </span>
                    <span>
                      <strong>{poll.title}</strong>
                      <small>{poll.description || poll.slug}</small>
                    </span>
                  </Link>
                ))}
              </div>
            )}
            <p className="poll-foot-link">
              <Link to="/poll">Choose another workspace</Link>
            </p>
          </>
        )}
      </div>
    </PollShell>
  );
}
