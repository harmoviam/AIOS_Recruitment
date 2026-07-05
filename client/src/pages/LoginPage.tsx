import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { getTenantBySlug, MOCK_TENANTS } from '../data/tenants';
import {
  getTenantSlugFromHost,
  platformLoginUrl,
  PLATFORM_LOGIN_PATH,
  tenantForgotPasswordPath,
  tenantLoginPath,
  tenantLoginUrl,
  tenantSubdomainLoginUrl,
} from '../utils/tenantUrl';

interface WorkspaceOption {
  slug: string;
  name: string;
  logoInitials?: string;
  primaryColor?: string;
}

interface TenantBranding {
  slug: string;
  name: string;
  logoInitials: string;
  primaryColor: string;
}

const DEMO_EMAILS: Record<string, string> = {
  platform: 'super@aios.com',
  'staffpro-agency': 'admin@aios.com',
  earlyjobs: 'admin@earlyjobs.com',
  talentbridge: 'admin@talentbridge.com',
};

const DEMO_HINTS: Record<string, string> = {
  platform: 'super@aios.com / password123',
  'staffpro-agency': 'admin@aios.com / password123 — Organization Admin',
  earlyjobs: 'admin@earlyjobs.com / password123 — Organization Admin (recruiters: nidhi@earlyjobs.in, moumita@earlyjobs.in)',
  talentbridge: 'admin@talentbridge.com / password123 — Organization Admin',
};

function LoginPicker({ workspaces }: { workspaces: WorkspaceOption[] }) {
  return (
    <div className="login-page">
      <div className="login-container wireframe" style={{ maxWidth: 720 }}>
        <div className="login-right" style={{ width: '100%', padding: '2rem' }}>
          <h3 className="form-title">Choose your organization</h3>
          <p className="form-subtitle">Each organization has a unique sign-in URL. Bookmark yours for quick access.</p>

          <div className="login-org-list">
            {workspaces.map((w) => (
              <Link key={w.slug} to={tenantLoginPath(w.slug)} className="login-org-card">
                <span className="org-avatar sm" style={{ background: w.primaryColor || '#2563EB' }}>
                  {w.logoInitials || w.name.slice(0, 2).toUpperCase()}
                </span>
                <span className="login-org-card-text">
                  <strong>{w.name}</strong>
                  <span className="text-muted">{tenantLoginUrl(w.slug)}</span>
                </span>
                <span className="login-org-arrow">→</span>
              </Link>
            ))}
          </div>

          <div className="card flat" style={{ marginTop: '1.5rem', padding: '1rem' }}>
            <strong>New organization?</strong>
            <p className="text-muted" style={{ margin: '0.35rem 0 0.75rem', fontSize: '0.9rem' }}>
              Start a free trial — you get a unique sign-in URL for your team.
            </p>
            <Link to="/login/new" className="button-pill button-primary btn-sm">
              Start free trial
            </Link>
          </div>

          <div className="card flat" style={{ marginTop: '1rem', padding: '1rem' }}>
            <strong>Platform Admin</strong>
            <p className="text-muted" style={{ margin: '0.35rem 0 0.75rem', fontSize: '0.9rem' }}>
              Master admin — manage organizations and plans (not recruitment).
            </p>
            <Link to={PLATFORM_LOGIN_PATH} className="button-pill button-secondary btn-sm">
              Platform sign in →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const { tenantSlug: routeSlug } = useParams<{ tenantSlug?: string }>();
  const location = useLocation();
  const isPlatformRoute = location.pathname === PLATFORM_LOGIN_PATH;
  const hostSlug = getTenantSlugFromHost();
  const isPicker = location.pathname === '/login' && !routeSlug && hostSlug !== 'platform' && !hostSlug;
  const isNewOrg = location.pathname === '/login/new';

  const lockedSlug = isPlatformRoute
    ? 'platform'
    : isNewOrg
      ? null
      : routeSlug || (hostSlug && hostSlug !== 'platform' ? hostSlug : null);

  if (isPicker) {
    return <LoginPickerContainer />;
  }

  if (isNewOrg) {
    return <TenantLoginForm workspace="" isPlatform={false} slugLocked={false} initialMode="register" />;
  }

  return (
    <TenantLoginForm
      key={lockedSlug ?? 'platform'}
      workspace={lockedSlug ?? 'platform'}
      isPlatform={isPlatformRoute || lockedSlug === 'platform'}
      slugLocked={!!lockedSlug && lockedSlug !== 'platform'}
    />
  );
}

function LoginPickerContainer() {
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>(
    MOCK_TENANTS.map((t) => ({ slug: t.slug, name: t.name, logoInitials: t.logoInitials, primaryColor: t.primaryColor }))
  );

  useEffect(() => {
    api
      .getWorkspaces()
      .then((list) => {
        if (list.length) {
          setWorkspaces(
            list.map((w) => ({
              slug: w.slug,
              name: w.name,
              logoInitials: w.logoInitials,
              primaryColor: w.primaryColor,
            }))
          );
        }
      })
      .catch(() => {});
  }, []);

  return <LoginPicker workspaces={workspaces} />;
}

function TenantLoginForm({
  workspace,
  isPlatform,
  slugLocked,
  initialMode = 'login',
}: {
  workspace: string;
  isPlatform: boolean;
  slugLocked: boolean;
  initialMode?: 'login' | 'register';
}) {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [branding, setBranding] = useState<TenantBranding | null>(null);
  const [tenantError, setTenantError] = useState('');
  const [email, setEmail] = useState(DEMO_EMAILS[workspace] || '');
  const [password, setPassword] = useState('password123');
  const [orgName, setOrgName] = useState('');
  const [registerSlug, setRegisterSlug] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const fallback = useMemo(() => getTenantBySlug(workspace), [workspace]);

  useEffect(() => {
    if (isPlatform || !workspace) {
      if (isPlatform) {
        setBranding(null);
        setTenantError('');
        setEmail(DEMO_EMAILS.platform);
      }
      return;
    }
    setEmail(DEMO_EMAILS[workspace] || '');
    setTenantError('');
    api
      .getTenantBySlug(workspace)
      .then((t) => {
        setBranding({
          slug: t.slug,
          name: t.name,
          logoInitials: t.logoInitials,
          primaryColor: t.primaryColor,
        });
        document.documentElement.style.setProperty('--primary', t.primaryColor);
      })
      .catch(() => {
        if (fallback) {
          setBranding({
            slug: fallback.slug,
            name: fallback.name,
            logoInitials: fallback.logoInitials,
            primaryColor: fallback.primaryColor,
          });
        } else {
          setTenantError('Organization not found. Check your sign-in URL.');
        }
      });
  }, [workspace, isPlatform, fallback]);

  const orgNameDisplay = branding?.name || fallback?.name || workspace;
  const orgColor = branding?.primaryColor || fallback?.primaryColor || '#2563EB';
  const orgInitials = branding?.logoInitials || fallback?.logoInitials || orgNameDisplay.slice(0, 2).toUpperCase();
  const loginPathUrl = slugLocked ? tenantLoginUrl(workspace) : platformLoginUrl();
  const subdomainUrl = slugLocked ? tenantSubdomainLoginUrl(workspace) : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (tenantError) return;
    setError('');
    setLoading(true);
    try {
      const ws = mode === 'register' ? registerSlug : workspace;
      localStorage.setItem('aios_tenant_slug', ws);
      if (mode === 'login') await login(email, password, workspace);
      else await register(email, password, name, orgName, registerSlug);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoading(false);
    }
  };

  const demoHint = DEMO_HINTS[workspace] || 'Use your organization email and password';
  const forgotPath = isPlatform ? '/forgot-password?workspace=platform' : tenantForgotPasswordPath(workspace);

  return (
    <div className="login-page">
      <div className="login-container wireframe">
        <div className="login-left" style={!isPlatform && workspace ? { background: `linear-gradient(135deg, ${orgColor}, color-mix(in srgb, ${orgColor} 70%, #0f172a))` } : undefined}>
          {!isPlatform && workspace ? (
            <>
              <div className="login-org-badge">
                <span className="org-avatar lg" style={{ background: 'rgba(255,255,255,0.2)' }}>{orgInitials}</span>
              </div>
              <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '1.25rem', color: 'white', fontWeight: 600 }}>
                {orgNameDisplay}
              </p>
              <p style={{ textAlign: 'center', marginTop: '0.5rem', fontSize: '0.9rem', color: 'rgba(255,255,255,0.9)' }}>
                {workspace}.aios.app
              </p>
            </>
          ) : (
            <>
              <div className="login-illustration">{isPlatform ? '⚙️' : '🤖'}</div>
              <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '1.1rem', color: 'white' }}>
                {isPlatform ? 'AIOS Platform Admin' : 'AI-Powered Recruitment CRM'}
              </p>
              <p style={{ textAlign: 'center', marginTop: '0.5rem', fontSize: '0.9rem', color: 'rgba(255,255,255,0.85)' }}>
                {isPlatform ? 'Organizations, plans & billing' : 'Create your organization workspace'}
              </p>
            </>
          )}
        </div>
        <div className="login-right">
          <form className="login-form" onSubmit={submit}>
            <h3 className="form-title">
              {mode === 'login'
                ? isPlatform
                  ? 'Platform Admin sign in'
                  : `Sign in to ${orgNameDisplay}`
                : 'Start your free trial'}
            </h3>
            <p className="form-subtitle">
              {isPlatform
                ? 'Master admin — manage all client organizations and plans'
                : 'Organization workspace — Org Admin, Hiring Manager, or Recruiter'}
            </p>

            {tenantError && <div className="form-error">{tenantError}</div>}
            {error && <div className="form-error">{error}</div>}

            {slugLocked && mode === 'login' && (
              <div className="login-url-banner">
                <span className="text-muted">Your sign-in URL</span>
                <code>{loginPathUrl}</code>
                {subdomainUrl && subdomainUrl !== loginPathUrl && (
                  <code className="text-muted" style={{ fontSize: '0.75rem' }}>{subdomainUrl}</code>
                )}
              </div>
            )}

            {mode === 'register' && !slugLocked && (
              <>
                <div className="form-group">
                  <label className="form-label">Organization name</label>
                  <input className="form-input" value={orgName} onChange={(e) => setOrgName(e.target.value)} required placeholder="EarlyJobs" />
                </div>
                <div className="form-group">
                  <label className="form-label">Workspace slug (your unique URL)</label>
                  <input
                    className="form-input"
                    value={registerSlug}
                    onChange={(e) => setRegisterSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    required
                    placeholder="earlyjobs"
                  />
                  <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: '0.35rem' }}>
                    Login URL: <strong>/login/{registerSlug || 'your-slug'}</strong>
                  </p>
                </div>
                <div className="form-group">
                  <label className="form-label">Your name</label>
                  <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
              </>
            )}

            <div className="form-group">
              <label className="form-label">Email</label>
              <input type="email" className="form-input" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input type="password" className="form-input" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>

            {mode === 'login' && (
              <p style={{ marginBottom: '1rem' }}>
                <Link to={forgotPath} className="link-button">Forgot password?</Link>
              </p>
            )}

            <button type="submit" className="form-button" disabled={loading || !!tenantError}>
              {loading ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Create workspace'}
            </button>

            <p style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '1rem' }}>
              Demo: {demoHint}
            </p>

            <p style={{ textAlign: 'center', fontSize: '0.85rem', marginTop: '1rem' }}>
              {!isPlatform && slugLocked && (
                <Link to="/login" className="link-button">← All organizations</Link>
              )}
              {isPlatform && (
                <Link to="/login" className="link-button">← Organization sign in</Link>
              )}
              {!slugLocked && !isPlatform && mode === 'login' && (
                <> · <Link to={PLATFORM_LOGIN_PATH} className="link-button">Platform Admin</Link></>
              )}
            </p>

            {!isPlatform && !slugLocked && mode === 'login' && (
              <p style={{ textAlign: 'center', fontSize: '0.85rem', marginTop: '0.75rem' }}>
                No account?{' '}
                <button type="button" className="link-button" onClick={() => setMode('register')}>
                  Start free trial
                </button>
              </p>
            )}
            {mode === 'register' && !slugLocked && (
              <p style={{ textAlign: 'center', fontSize: '0.85rem', marginTop: '0.75rem' }}>
                Have an account?{' '}
                <button type="button" className="link-button" onClick={() => setMode('login')}>
                  Sign in
                </button>
              </p>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
