import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import {
  getWalkthrough,
  WALKTHROUGH_GUIDES,
  WALKTHROUGH_ROLE_ORDER,
} from '../data/walkthroughs';
import WalkthroughPlayer from '../components/WalkthroughPlayer';
import { PLATFORM_LOGIN_PATH, tenantLoginPath } from '../utils/tenantUrl';

export function WalkthroughHub({ orgSlug }: { orgSlug?: string }) {
  const backTo = orgSlug ? tenantLoginPath(orgSlug) : '/login';

  return (
    <div className="walkthrough-page">
      <div className="walkthrough-hub wireframe">
        <Link to={backTo} className="back-link">← Back to sign in</Link>
        <h1 className="form-title">Role walkthroughs</h1>
        <p className="form-subtitle">
          Short guided tours for each login type — what to expect after you sign in.
        </p>

        <div className="wt-hub-grid">
          {WALKTHROUGH_ROLE_ORDER.map((role) => {
            const g = WALKTHROUGH_GUIDES[role];
            const path = orgSlug && role !== 'platform'
              ? `/walkthrough/${role}?org=${orgSlug}`
              : `/walkthrough/${role}`;
            return (
              <Link key={role} to={path} className="wt-hub-card">
                <span className="wt-hub-icon" style={{ background: g.accent }}>{g.icon}</span>
                <strong>{g.title}</strong>
                <span className="text-muted">{g.subtitle}</span>
                <span className="wt-hub-cta">Watch walkthrough →</span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function WalkthroughPage() {
  const { role } = useParams<{ role: string }>();
  const [searchParams] = useSearchParams();
  const orgSlug = searchParams.get('org') ?? undefined;

  if (!role) {
    return <WalkthroughHub orgSlug={orgSlug} />;
  }

  const guide = getWalkthrough(role);
  if (!guide) return <Navigate to="/walkthrough" replace />;

  const backTo =
    role === 'platform'
      ? PLATFORM_LOGIN_PATH
      : orgSlug
        ? tenantLoginPath(orgSlug)
        : guide.loginUrl;

  return (
    <div className="walkthrough-page">
      <div className="walkthrough-shell wireframe">
        <WalkthroughPlayer
          guide={guide}
          backTo={backTo}
          backLabel={role === 'platform' ? '← Platform sign in' : '← Back to sign in'}
        />
      </div>
    </div>
  );
}
