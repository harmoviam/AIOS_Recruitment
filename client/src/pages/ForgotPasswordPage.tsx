import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { tenantLoginPath } from '../utils/tenantUrl';

export default function ForgotPasswordPage() {
  const { tenantSlug: routeSlug } = useParams<{ tenantSlug?: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const workspace =
    routeSlug || searchParams.get('workspace') || localStorage.getItem('aios_tenant_slug') || 'staffpro-agency';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [resetUrl, setResetUrl] = useState('');

  const backPath = workspace === 'platform' ? '/platform/login' : tenantLoginPath(workspace);

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.forgotPassword(email, workspace);
      setMessage(res.message);
      if (res.resetUrl) setResetUrl(res.resetUrl);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Request failed');
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    try {
      const res = await api.resetPassword(token, password);
      setMessage(res.message);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Reset failed');
    }
  };

  return (
    <div className="login-page">
      <div className="forgot-card wireframe">
        <Link to={backPath} className="back-link">← Back to Sign in</Link>
        <h1 className="form-title">{token ? 'Set new password' : 'Reset your password'}</h1>
        <p className="form-subtitle">
          {token ? 'Enter your new password below.' : `Workspace: ${workspace}`}
        </p>

        {message && <p className="form-subtitle" style={{ color: 'var(--success)' }}>{message}</p>}
        {resetUrl && (
          <p className="form-subtitle">
            Dev reset link: <a href={resetUrl}>{resetUrl}</a>
          </p>
        )}

        {token ? (
          <form onSubmit={handleReset}>
            <div className="form-group">
              <label className="form-label" htmlFor="password">New password</label>
              <input
                id="password"
                type="password"
                className="form-input"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <button type="submit" className="form-button">Update Password</button>
          </form>
        ) : (
          <form onSubmit={handleForgot}>
            <div className="form-group">
              <label className="form-label" htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                className="form-input"
                required
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <button type="submit" className="form-button">Send Reset Link</button>
          </form>
        )}
      </div>
    </div>
  );
}
