import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import type { PollMotivation, PollResult } from '../../types';
import { getPollRecruiterId, pollPath } from '../../utils/pollSession';
import PollShell from './PollShell';

export default function PollResultPage() {
  const { tenantSlug = '', pollSlug = '' } = useParams();
  const navigate = useNavigate();
  const recruiterId = getPollRecruiterId(tenantSlug, pollSlug);
  const [result, setResult] = useState<PollResult | null>(null);
  const [motivation, setMotivation] = useState<PollMotivation | null>(null);
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
        setMotivation(data.motivation);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Result not available');
      })
      .finally(() => setLoading(false));
  }, [tenantSlug, pollSlug, recruiterId, navigate]);

  if (!tenantSlug || !pollSlug || !recruiterId) return null;

  return (
    <PollShell
      subtitle={pollTitle ? `Result · ${pollTitle}` : 'Your assessment result'}
      tenantSlug={tenantSlug}
      tenantName={tenantName}
    >
      <div className="poll-card poll-card--narrow">
        {loading ? (
          <div className="poll-loading">
            <span className="login-spinner" aria-hidden />
            Loading result…
          </div>
        ) : error || !result ? (
          <div>
            <p className="form-error">{error || 'Result not found'}</p>
            <Link to={pollPath(tenantSlug, pollSlug, '/assessment')} className="button-pill button-primary">
              Take assessment
            </Link>
          </div>
        ) : (
          <>
            <div className={`poll-motivation poll-motivation--${motivation?.tier || 'good'}`}>
              <span className="poll-motivation-emoji" aria-hidden>
                {motivation?.emoji}
              </span>
              <h1>{motivation?.title}</h1>
              <p>{motivation?.message}</p>
            </div>

            <div className="poll-result-grid">
              <div className="poll-stat">
                <span>Total Questions</span>
                <strong>{result.total_questions}</strong>
              </div>
              <div className="poll-stat">
                <span>Correct Answers</span>
                <strong className="text-success">{result.correct_answers}</strong>
              </div>
              <div className="poll-stat">
                <span>Wrong Answers</span>
                <strong className="text-danger">{result.wrong_answers}</strong>
              </div>
              <div className="poll-stat">
                <span>Percentage</span>
                <strong>{result.percentage}%</strong>
              </div>
            </div>

            <div className={`poll-status-pill poll-status-pill--${result.status}`}>
              {result.status === 'pass' ? 'Pass' : 'Fail'}
            </div>

            <div className="poll-nav">
              <Link to={pollPath(tenantSlug, pollSlug, '/dashboard')} className="button-pill button-primary">
                View My Dashboard
              </Link>
              <Link to={pollPath(tenantSlug, pollSlug, '/assessment')} className="button-pill button-secondary">
                Retake Assessment
              </Link>
            </div>
          </>
        )}
      </div>
    </PollShell>
  );
}
