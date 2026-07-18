import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import type { PollResult } from '../../types';
import { getPollRecruiterId, pollPath } from '../../utils/pollSession';
import PollShell from './PollShell';

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default function PollRecruiterDashboardPage() {
  const { tenantSlug = '', pollSlug = '' } = useParams();
  const navigate = useNavigate();
  const recruiterId = getPollRecruiterId(tenantSlug, pollSlug);
  const [result, setResult] = useState<PollResult | null>(null);
  const [tenantName, setTenantName] = useState('');
  const [pollTitle, setPollTitle] = useState('');
  const [loading, setLoading] = useState(true);
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
    if (!recruiterId) {
      navigate(pollPath(tenantSlug, pollSlug), { replace: true });
      return;
    }
    Promise.all([
      api.pollGetPollMeta(tenantSlug, pollSlug),
      api.pollGetResult(tenantSlug, pollSlug, recruiterId),
    ])
      .then(([meta, data]) => {
        setTenantName(meta.name);
        setPollTitle(meta.poll?.title || '');
        setResult(data.result);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load dashboard'))
      .finally(() => setLoading(false));
  }, [tenantSlug, pollSlug, recruiterId, navigate]);

  if (!tenantSlug || !pollSlug || !recruiterId) return null;

  return (
    <PollShell
      subtitle={pollTitle ? `Dashboard · ${pollTitle}` : 'Your assessment dashboard'}
      tenantSlug={tenantSlug}
      tenantName={tenantName}
    >
      <div className="poll-card">
        <h1 className="poll-title">My Assessment Dashboard</h1>
        {loading ? (
          <div className="poll-loading">
            <span className="login-spinner" aria-hidden />
            Loading…
          </div>
        ) : error || !result ? (
          <div>
            <p className="form-error">{error || 'No result yet'}</p>
            <Link to={pollPath(tenantSlug, pollSlug, '/assessment')} className="button-pill button-primary">
              Start Assessment
            </Link>
          </div>
        ) : (
          <>
            <p className="poll-lead">
              Hello{result.name ? `, ${result.name}` : ''} — results for{' '}
              {pollTitle || tenantName || 'this poll'}.
            </p>
            <div className="poll-dash-grid">
              <div className="card">
                <div className="card-title">Score</div>
                <div className="card-value">
                  {result.score}/{result.total_questions}
                </div>
              </div>
              <div className="card">
                <div className="card-title">Percentage</div>
                <div className="card-value">{result.percentage}%</div>
              </div>
              <div className="card">
                <div className="card-title">Status</div>
                <div className="card-value">
                  <span className={`poll-status-pill poll-status-pill--${result.status}`}>
                    {result.status === 'pass' ? 'Pass' : 'Fail'}
                  </span>
                </div>
              </div>
              <div className="card">
                <div className="card-title">Attempt Date</div>
                <div className="card-value poll-card-value-sm">{formatDate(result.completed_at)}</div>
              </div>
              <div className="card">
                <div className="card-title">Questions</div>
                <div className="card-value">{result.total_questions}</div>
              </div>
              <div className="card">
                <div className="card-title">Correct</div>
                <div className="card-value text-success">{result.correct_answers}</div>
              </div>
              <div className="card">
                <div className="card-title">Wrong</div>
                <div className="card-value text-danger">{result.wrong_answers}</div>
              </div>
            </div>
            <div className="poll-nav" style={{ marginTop: '1.25rem' }}>
              <Link to={pollPath(tenantSlug, pollSlug, '/result')} className="button-pill button-secondary">
                View Result Screen
              </Link>
              <Link to={pollPath(tenantSlug, pollSlug, '/assessment')} className="button-pill button-primary">
                Retake Assessment
              </Link>
            </div>
          </>
        )}
      </div>
    </PollShell>
  );
}
