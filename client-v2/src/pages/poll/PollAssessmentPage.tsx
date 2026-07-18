import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import type { PollQuestionPublic } from '../../types';
import { getPollRecruiterId, pollPath } from '../../utils/pollSession';
import { showToast } from '../../utils/toast';
import PollShell from './PollShell';

export default function PollAssessmentPage() {
  const { tenantSlug = '', pollSlug = '' } = useParams();
  const navigate = useNavigate();
  const recruiterId = getPollRecruiterId(tenantSlug, pollSlug);
  const [tenantName, setTenantName] = useState('');
  const [pollTitle, setPollTitle] = useState('');
  const [questions, setQuestions] = useState<PollQuestionPublic[]>([]);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
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
    api
      .pollGetQuestions(tenantSlug, pollSlug)
      .then((data) => {
        setQuestions(data.questions);
        setTenantName(data.tenant?.name || '');
        setPollTitle(data.poll?.title || '');
        if (data.questions.length === 0) {
          setError('No assessment questions are available right now.');
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load questions'))
      .finally(() => setLoading(false));
  }, [tenantSlug, pollSlug, recruiterId, navigate]);

  const current = questions[index];
  const total = questions.length;
  const answeredCount = useMemo(
    () => questions.filter((q) => answers[q.id] != null).length,
    [questions, answers]
  );
  const progress = total === 0 ? 0 : ((index + 1) / total) * 100;
  const allAnswered = total > 0 && answeredCount === total;
  const isLast = index === total - 1;

  function selectOption(option: number) {
    if (!current) return;
    setAnswers((prev) => ({ ...prev, [current.id]: option }));
  }

  async function submit() {
    if (!tenantSlug || !pollSlug || !recruiterId) return;
    if (!allAnswered) {
      showToast('Please answer all questions before submitting', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const payload = questions.map((q) => ({
        question_id: q.id,
        selected_option: answers[q.id],
      }));
      await api.pollSubmit(tenantSlug, pollSlug, recruiterId, payload);
      showToast('Assessment submitted successfully', 'success');
      navigate(pollPath(tenantSlug, pollSlug, '/result'));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Submission failed';
      showToast(msg, 'error');
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  if (!tenantSlug || !pollSlug || !recruiterId) return null;

  return (
    <PollShell
      subtitle={pollTitle ? `Assessment · ${pollTitle}` : 'One question at a time'}
      tenantSlug={tenantSlug}
      tenantName={tenantName}
    >
      <div className="poll-card">
        {loading ? (
          <div className="poll-loading">
            <span className="login-spinner" aria-hidden />
            Loading questions…
          </div>
        ) : error && questions.length === 0 ? (
          <div>
            <p className="form-error">{error}</p>
            <Link to={pollPath(tenantSlug, pollSlug)} className="button-pill button-secondary">
              Back to registration
            </Link>
          </div>
        ) : current ? (
          <>
            <div className="poll-progress-meta">
              <span>
                Question {index + 1} of {total}
              </span>
              <span>
                {answeredCount}/{total} answered
              </span>
            </div>
            <div
              className="poll-progress"
              role="progressbar"
              aria-valuenow={Math.round(progress)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="poll-progress-bar" style={{ width: `${progress}%` }} />
            </div>

            <h1 className="poll-question">{current.question}</h1>

            <div className="poll-options" role="radiogroup" aria-label="Answer options">
              {[1, 2, 3, 4].map((n) => {
                const label = current[`option${n}` as keyof PollQuestionPublic] as string;
                const selected = answers[current.id] === n;
                return (
                  <button
                    key={n}
                    type="button"
                    className={`poll-option${selected ? ' poll-option--selected' : ''}`}
                    onClick={() => selectOption(n)}
                    role="radio"
                    aria-checked={selected}
                  >
                    <span className="poll-option-marker">{String.fromCharCode(64 + n)}</span>
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>

            {error && <p className="form-error">{error}</p>}

            <div className="poll-nav">
              <button
                type="button"
                className="button-pill button-secondary"
                disabled={index === 0 || submitting}
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
              >
                Previous
              </button>
              {!isLast ? (
                <button
                  type="button"
                  className="button-pill button-primary"
                  disabled={answers[current.id] == null || submitting}
                  onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}
                >
                  Next
                </button>
              ) : (
                <button
                  type="button"
                  className="button-pill button-primary"
                  disabled={!allAnswered || submitting}
                  onClick={submit}
                >
                  {submitting ? (
                    <span className="poll-btn-loading">
                      <span className="login-spinner" aria-hidden />
                      Submitting…
                    </span>
                  ) : (
                    'Submit'
                  )}
                </button>
              )}
            </div>
          </>
        ) : null}
      </div>
    </PollShell>
  );
}
