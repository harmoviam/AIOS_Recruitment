import { Link } from 'react-router-dom';
import { pollPath } from '../../utils/pollSession';

export default function PollShell({
  children,
  subtitle = 'Recruiter knowledge check',
  tenantSlug,
  tenantName,
}: {
  children: React.ReactNode;
  subtitle?: string;
  tenantSlug?: string;
  tenantName?: string;
}) {
  const home = tenantSlug ? pollPath(tenantSlug) : '/poll';
  return (
    <div className="poll-shell">
      <header className="poll-shell-header">
        <Link to={home} className="poll-brand">
          <span className="poll-brand-mark" aria-hidden>
            HR
          </span>
          <div>
            <strong>{tenantName ? `${tenantName} Poll` : 'HarmiRecruit Poll'}</strong>
            <span>{subtitle}</span>
          </div>
        </Link>
      </header>
      <main className="poll-shell-main">{children}</main>
    </div>
  );
}
