import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { pollPath, setPollRecruiterId } from '../../utils/pollSession';
import { showToast } from '../../utils/toast';
import PollShell from './PollShell';

export default function PollRegisterPage() {
  const { tenantSlug = '' } = useParams();
  const navigate = useNavigate();
  const [tenantName, setTenantName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [loading, setLoading] = useState(false);
  const [bootLoading, setBootLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!tenantSlug) {
      navigate('/poll', { replace: true });
      return;
    }
    api
      .pollGetMeta(tenantSlug)
      .then((meta) => setTenantName(meta.name))
      .catch((err) => setError(err instanceof Error ? err.message : 'Workspace not found'))
      .finally(() => setBootLoading(false));
  }, [tenantSlug, navigate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!tenantSlug) return;
    setError('');
    setLoading(true);
    try {
      const { recruiter } = await api.pollRegister(tenantSlug, {
        name: name.trim(),
        email: email.trim(),
        mobile: mobile.trim(),
        company_name: companyName.trim(),
      });
      setPollRecruiterId(tenantSlug, recruiter.id);
      showToast('Registration successful — starting assessment', 'success');
      navigate(pollPath(tenantSlug, '/assessment'));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Registration failed';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <PollShell subtitle="Register before you begin" tenantSlug={tenantSlug} tenantName={tenantName}>
      <div className="poll-card poll-card--narrow">
        {bootLoading ? (
          <div className="poll-loading">
            <span className="login-spinner" aria-hidden />
            Loading workspace…
          </div>
        ) : error && !tenantName ? (
          <div>
            <p className="form-error">{error}</p>
            <Link to="/poll" className="button-pill button-secondary">
              Choose another workspace
            </Link>
          </div>
        ) : (
          <>
            <h1 className="poll-title">Recruiter Registration</h1>
            <p className="poll-lead">
              Complete your details for the {tenantName || 'organization'} recruitment knowledge assessment.
            </p>

            <form className="poll-form" onSubmit={onSubmit}>
              <label className="form-group">
                <span>Full Name</span>
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your full name"
                  autoComplete="name"
                />
              </label>
              <label className="form-group">
                <span>Email Address</span>
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  autoComplete="email"
                />
              </label>
              <label className="form-group">
                <span>Mobile Number</span>
                <input
                  required
                  type="tel"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  placeholder="+91 9876543210"
                  autoComplete="tel"
                />
              </label>
              <label className="form-group">
                <span>Company Name</span>
                <input
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Your organization"
                  autoComplete="organization"
                />
              </label>

              {error && <p className="form-error">{error}</p>}

              <button type="submit" className="button-pill button-primary poll-submit" disabled={loading}>
                {loading ? (
                  <span className="poll-btn-loading">
                    <span className="login-spinner" aria-hidden />
                    Registering…
                  </span>
                ) : (
                  'Register & Start Assessment'
                )}
              </button>
            </form>

            <p className="poll-foot-link">
              Already registered?{' '}
              <Link to={pollPath(tenantSlug, '/assessment')}>Continue assessment</Link>
              {' · '}
              <Link to={pollPath(tenantSlug, '/dashboard')}>View my result</Link>
            </p>
          </>
        )}
      </div>
    </PollShell>
  );
}
