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
import { showDemoCredentials } from '../utils/demoMode';
import { WALKTHROUGH_GUIDES, type WalkthroughRole } from '../data/walkthroughs';

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`login-brand${compact ? ' login-brand--compact' : ''}`}>
      <span className="login-brand-icon" aria-hidden>
        <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="32" height="32" rx="9" fill="url(#brand-grad)" />
          <path
            d="M9 22V10h3.2l3.4 7.2L19 10h3.2v12h-2.6v-7.1L16.2 22h-2.1l-3.4-7.1V22H9z"
            fill="white"
          />
          <defs>
            <linearGradient id="brand-grad" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
              <stop stopColor="var(--primary)" />
              <stop offset="1" stopColor="var(--primary-strong)" />
            </linearGradient>
          </defs>
        </svg>
      </span>
      <div className="login-brand-text">
        <strong>HarmiRecruit</strong>
        {!compact && <span>AI-powered hiring, simplified</span>}
      </div>
    </div>
  );
}

function WalkthroughLinks({
  orgSlug,
  variant = 'org',
}: {
  orgSlug?: string;
  variant?: 'platform' | 'org' | 'picker';
}) {
  const q = orgSlug ? `?org=${orgSlug}` : '';
  const roles: { role: WalkthroughRole; label: string }[] =
    variant === 'platform'
      ? [{ role: 'platform', label: 'Platform Admin tour' }]
      : variant === 'picker'
        ? [
            { role: 'platform', label: 'Platform Admin' },
            { role: 'org-admin', label: 'Org Admin' },
            { role: 'hiring-manager', label: 'Hiring Manager' },
            { role: 'recruiter', label: 'Recruiter' },
          ]
        : [
            { role: 'org-admin', label: 'Org Admin' },
            { role: 'hiring-manager', label: 'Hiring Manager' },
            { role: 'recruiter', label: 'Recruiter' },
          ];

  return (
    <div className="login-wt-strip">
      <span className="login-wt-label">Video walkthroughs</span>
      <div className="login-wt-links">
        {roles.map(({ role, label }) => (
          <Link
            key={role}
            to={`/walkthrough/${role}${q}`}
            className="login-wt-chip"
            style={{ '--wt-chip-color': WALKTHROUGH_GUIDES[role].accent } as React.CSSProperties}
          >
            <span className="login-wt-chip-icon">{WALKTHROUGH_GUIDES[role].icon}</span>
            {label}
          </Link>
        ))}
        {variant === 'org' && orgSlug && (
          <Link to={`/walkthrough?org=${orgSlug}`} className="login-wt-all">
            All roles →
          </Link>
        )}
      </div>
    </div>
  );
}

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
  earlyjobs: 'admin@earlyjobs.com / password123 — Org Admin · HM: Nidhi@earlyjobs.in · Recruiters: moumita@earlyjobs.in',
  talentbridge: 'admin@talentbridge.com / password123 — Organization Admin',
};

function LoginPicker({ workspaces }: { workspaces: WorkspaceOption[] }) {
  return (
    <div className="login-page login-page--picker">
      <div className="login-bg" aria-hidden>
        <span className="login-orb login-orb--1" />
        <span className="login-orb login-orb--2" />
        <span className="login-orb login-orb--3" />
      </div>

      <div className="login-shell">
        <header className="login-hero login-hero--picker">
          <BrandMark />
          <h1 className="login-headline">Choose your workspace</h1>
          <p className="login-lead">
            Each organization has its own sign-in URL. Pick yours to continue.
          </p>
        </header>

        <div className="login-card login-card--picker">
          <div className="login-org-list">
            {workspaces.map((w) => (
              <Link key={w.slug} to={tenantLoginPath(w.slug)} className="login-org-card">
                <span
                  className="org-avatar sm login-org-avatar"
                  style={{ background: w.primaryColor || '#2563EB' }}
                >
                  {w.logoInitials || w.name.slice(0, 2).toUpperCase()}
                </span>
                <span className="login-org-card-text">
                  <strong>{w.name}</strong>
                  <span className="text-muted">{tenantLoginUrl(w.slug)}</span>
                </span>
                <span className="login-org-arrow" aria-hidden>›</span>
              </Link>
            ))}
          </div>

          <div className="login-action-cards">
            <div className="login-action-card login-action-card--highlight">
              <div>
                <strong>New organization?</strong>
                <p>Start a free trial and get a unique sign-in URL for your team.</p>
              </div>
              <Link to="/login/new" className="button-pill button-primary btn-sm">
                Start free trial
              </Link>
            </div>

            <div className="login-action-card">
              <div>
                <strong>Platform Admin</strong>
                <p>Manage organizations, plans, and billing.</p>
              </div>
              <Link to={PLATFORM_LOGIN_PATH} className="button-pill button-secondary btn-sm">
                Sign in →
              </Link>
            </div>
          </div>

          <WalkthroughLinks variant="picker" />
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
  const [email, setEmail] = useState(showDemoCredentials ? DEMO_EMAILS[workspace] || '' : '');
  const [password, setPassword] = useState(showDemoCredentials ? 'password123' : '');
  const [showPassword, setShowPassword] = useState(false);
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
        if (showDemoCredentials) setEmail(DEMO_EMAILS.platform);
      }
      return;
    }
    if (showDemoCredentials) setEmail(DEMO_EMAILS[workspace] || '');
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

  const heroStyle =
    !isPlatform && workspace
      ? ({
          '--login-hero-accent': orgColor,
        } as React.CSSProperties)
      : undefined;

  const title =
    mode === 'login'
      ? isPlatform
        ? 'Platform Admin'
        : `Welcome back`
      : 'Start your free trial';

  const subtitle =
    mode === 'login'
      ? isPlatform
        ? 'Manage organizations, plans, and billing'
        : `Sign in to ${orgNameDisplay}`
      : 'Create your organization workspace in minutes';

  return (
    <div className="login-page login-page--form">
      <div className="login-bg" aria-hidden>
        <span className="login-orb login-orb--1" />
        <span className="login-orb login-orb--2" />
        <span className="login-orb login-orb--3" />
      </div>

      <div className="login-shell login-shell--form">
        <header
          className={`login-hero login-hero--tenant${slugLocked && !isPlatform ? ' login-hero--branded' : ''}`}
          style={heroStyle}
        >
          {slugLocked && !isPlatform ? (
            <div className="login-tenant-badge">
              <span className="org-avatar lg login-tenant-avatar">{orgInitials}</span>
              <div className="login-tenant-meta">
                <strong>{orgNameDisplay}</strong>
                <span>{workspace}.aios.app</span>
              </div>
            </div>
          ) : isPlatform ? (
            <div className="login-tenant-badge">
              <span className="login-hero-emoji" aria-hidden>⚙️</span>
              <div className="login-tenant-meta">
                <strong>AIOS Platform</strong>
                <span>Master admin console</span>
              </div>
            </div>
          ) : (
            <BrandMark compact />
          )}

          {!slugLocked && !isPlatform && mode === 'register' && (
            <p className="login-lead login-lead--hero">Build your hiring pipeline with AI-powered tools.</p>
          )}
        </header>

        <div className="login-card login-card--form">
          <form className="login-form" onSubmit={submit}>
            <div className="login-form-header">
              <h1 className="login-form-title">{title}</h1>
              <p className="login-form-subtitle">{subtitle}</p>
            </div>

            {tenantError && <div className="form-error">{tenantError}</div>}
            {error && <div className="form-error">{error}</div>}

            {slugLocked && mode === 'login' && (
              <div className="login-url-banner">
                <span className="login-url-label">Your sign-in URL</span>
                <code>{loginPathUrl}</code>
                {subdomainUrl && subdomainUrl !== loginPathUrl && (
                  <code className="login-url-alt">{subdomainUrl}</code>
                )}
              </div>
            )}

            {mode === 'register' && !slugLocked && (
              <>
                <div className="form-group">
                  <label className="form-label" htmlFor="org-name">Organization name</label>
                  <div className="login-input-wrap">
                    <span className="login-input-icon" aria-hidden>🏢</span>
                    <input
                      id="org-name"
                      className="form-input login-input"
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      required
                      placeholder="EarlyJobs"
                      autoComplete="organization"
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="workspace-slug">Workspace URL</label>
                  <div className="workspace-input-wrap">
                    <input
                      id="workspace-slug"
                      className="form-input workspace-slug"
                      value={registerSlug}
                      onChange={(e) => setRegisterSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                      required
                      placeholder="earlyjobs"
                      autoComplete="off"
                    />
                    <span className="workspace-suffix">.aios.app</span>
                  </div>
                  <p className="login-field-hint">
                    Login at <strong>/login/{registerSlug || 'your-slug'}</strong>
                  </p>
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="your-name">Your name</label>
                  <div className="login-input-wrap">
                    <span className="login-input-icon" aria-hidden>👤</span>
                    <input
                      id="your-name"
                      className="form-input login-input"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      autoComplete="name"
                    />
                  </div>
                </div>
              </>
            )}

            <div className="form-group">
              <label className="form-label" htmlFor="email">Email</label>
              <div className="login-input-wrap">
                <span className="login-input-icon" aria-hidden>✉️</span>
                <input
                  id="email"
                  type="email"
                  className="form-input login-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  inputMode="email"
                  placeholder="you@company.com"
                />
              </div>
            </div>

            <div className="form-group">
              <div className="login-label-row">
                <label className="form-label" htmlFor="password">Password</label>
                {mode === 'login' && (
                  <Link to={forgotPath} className="login-forgot-link">
                    Forgot?
                  </Link>
                )}
              </div>
              <div className="login-input-wrap">
                <span className="login-input-icon" aria-hidden>🔒</span>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  className="form-input login-input login-input--password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  className="login-password-toggle"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            <button type="submit" className="login-submit" disabled={loading || !!tenantError}>
              {loading ? (
                <span className="login-submit-loading">
                  <span className="login-spinner" aria-hidden />
                  Please wait…
                </span>
              ) : mode === 'login' ? (
                'Sign in'
              ) : (
                'Create workspace'
              )}
            </button>

            {showDemoCredentials && mode === 'login' && (
              <details className="login-demo">
                <summary>Demo credentials</summary>
                <p>{demoHint}</p>
              </details>
            )}

            {mode === 'login' && (
              <WalkthroughLinks
                orgSlug={slugLocked && !isPlatform ? workspace : undefined}
                variant={isPlatform ? 'platform' : slugLocked ? 'org' : 'picker'}
              />
            )}

            <nav className="login-footer-nav" aria-label="Login navigation">
              {!isPlatform && slugLocked && (
                <Link to="/login" className="login-footer-link">← All organizations</Link>
              )}
              {isPlatform && (
                <Link to="/login" className="login-footer-link">← Organization sign in</Link>
              )}
              {!slugLocked && !isPlatform && mode === 'login' && (
                <Link to={PLATFORM_LOGIN_PATH} className="login-footer-link">Platform Admin</Link>
              )}
            </nav>

            {!isPlatform && !slugLocked && mode === 'login' && (
              <p className="login-switch-mode">
                No account?{' '}
                <button type="button" className="link-button" onClick={() => setMode('register')}>
                  Start free trial
                </button>
              </p>
            )}
            {mode === 'register' && !slugLocked && (
              <p className="login-switch-mode">
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
