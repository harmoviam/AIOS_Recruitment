import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { pollPath, setPollRecruiterId } from '../../utils/pollSession';
import { showToast } from '../../utils/toast';
import PollShell from './PollShell';

export default function PollRegisterPage() {
  const { tenantSlug = '', pollSlug = '' } = useParams();
  const navigate = useNavigate();
  const [tenantName, setTenantName] = useState('');
  const [pollTitle, setPollTitle] = useState('');
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
    if (!pollSlug) {
      navigate(pollPath(tenantSlug), { replace: true });
      return;
    }
    api
      .pollGetPollMeta(tenantSlug, pollSlug)
      .then((meta) => {
        setTenantName(meta.name);
        setPollTitle(meta.poll?.title || '');
        if (meta.poll?.status && meta.poll.status !== 'open') {
          setError('This poll is not open for registrations');
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Poll not found'))
      .finally(() => setBootLoading(false));
  }, [tenantSlug, pollSlug, navigate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!tenantSlug || !pollSlug) return;
    setError('');
    setLoading(true);
    try {
      const { recruiter } = await api.pollRegister(tenantSlug, pollSlug, {
        name: name.trim(),
        email: email.trim(),
        mobile: mobile.trim(),
        company_name: companyName.trim(),
      });
      setPollRecruiterId(tenantSlug, pollSlug, recruiter.id);
      showToast('Registration successful — starting assessment', 'success');
      navigate(pollPath(tenantSlug, pollSlug, '/assessment'));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Registration failed';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <PollShell
      subtitle={pollTitle ? `Register · ${pollTitle}` : 'Register before you begin'}
      tenantSlug={tenantSlug}
      tenantName={tenantName}
    >
      <div className="poll-card poll-card--narrow">
        {bootLoading ? (
          <div className="poll-loading">
            <span className="login-spinner" aria-hidden />
            Loading poll…
          </div>
        ) : error && !tenantName ? (
          <div>
            <p className="form-error">{error}</p>
            <Link to={pollPath(tenantSlug)} className="button-pill button-secondary">
              View open polls
            </Link>
          </div>
        ) : (
          <>
            <h1 className="poll-title">Recruiter Registration</h1>
            <p className="poll-lead">
              Complete your details for{' '}
              {pollTitle ? <strong>{pollTitle}</strong> : 'this poll'}
              {tenantName ? ` at ${tenantName}` : ''}.
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
              <Link to={pollPath(tenantSlug, pollSlug, '/assessment')}>Continue assessment</Link>
              {' · '}
              <Link to={pollPath(tenantSlug, pollSlug, '/dashboard')}>View my result</Link>
              {' · '}
              <Link to={pollPath(tenantSlug)}>Other polls</Link>
            </p>
          </>
        )}
      </div>
    </PollShell>
  );
}
