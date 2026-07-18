import { useEffect, useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { getTenantLogoUrl } from '../../data/tenantLogos';
import { pollPath } from '../../utils/pollSession';
import PollShell from './PollShell';

type Workspace = { slug: string; name: string; logoInitials: string; primaryColor: string; status?: string };

export default function PollEntryPage() {
  const navigate = useNavigate();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const stored = localStorage.getItem('aios_tenant_slug');
    if (stored && stored !== 'platform') {
      navigate(pollPath(stored), { replace: true });
      return;
    }
    api
      .getWorkspaces()
      .then((rows) => setWorkspaces(rows as Workspace[]))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load workspaces'))
      .finally(() => setLoading(false));
  }, [navigate]);

  return (
    <PollShell subtitle="Choose your organization workspace">
      <div className="poll-card poll-card--narrow">
        <h1 className="poll-title">Recruiter Poll</h1>
        <p className="poll-lead">Select the organization whose assessment you want to take.</p>
        {loading ? (
          <div className="poll-loading">
            <span className="login-spinner" aria-hidden />
            Loading workspaces…
          </div>
        ) : error ? (
          <p className="form-error">{error}</p>
        ) : (
          <div className="poll-workspace-list">
            {workspaces.map((ws) => {
              const logoUrl = getTenantLogoUrl(ws.slug);
              return (
                <Link
                  key={ws.slug}
                  to={pollPath(ws.slug)}
                  className={`poll-workspace-item${logoUrl ? ' poll-workspace-item--logo' : ''}`}
                  style={{ '--ws-color': ws.primaryColor } as CSSProperties}
                >
                  {logoUrl ? (
                    <img className="poll-workspace-logo" src={logoUrl} alt={`${ws.name} logo`} />
                  ) : (
                    <span className="poll-workspace-mark">{ws.logoInitials}</span>
                  )}
                  <span>
                    <strong>{ws.name}</strong>
                    <small>{ws.slug}</small>
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </PollShell>
  );
}
