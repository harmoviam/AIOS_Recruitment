import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import InterviewEvaluationPanel from '../components/InterviewEvaluationPanel';
import type { Interview, InterviewEvaluation } from '../types';

export default function InterviewEvaluationPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [interview, setInterview] = useState<Interview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api
      .getInterview(Number(id))
      .then(setInterview)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  const onSaved = (evaluation: InterviewEvaluation) => {
    setInterview((prev) => (prev ? { ...prev, evaluation, score: evaluation.overall_score ?? prev.score } : prev));
  };

  if (loading) return <div className="page-content">Loading…</div>;

  if (error || !interview) {
    return (
      <div className="page-content">
        <div className="card">
          <h1 className="section-title">Interview not found</h1>
          <p className="text-muted">{error || 'Unable to load interview.'}</p>
          <button type="button" className="button-pill button-secondary" onClick={() => navigate('/interviews')}>
            Back to interviews
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="topbar">
        <button type="button" className="button-pill button-secondary" onClick={() => navigate(-1)}>
          ← Back
        </button>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Link to={`/candidates/${interview.candidate_id}`} className="button-pill button-secondary">
            Candidate profile
          </Link>
          <Link to={`/interviews/${interview.id}/room`} className="button-pill button-primary">
            Join video call
          </Link>
        </div>
      </div>
      <div className="page-content">
        <h1 className="section-title">Interview Screening</h1>
        <p className="section-description">
          {interview.candidate_name} · {interview.round_type} ·{' '}
          {new Date(interview.scheduled_at).toLocaleString()}
        </p>
        <div className="card">
          <InterviewEvaluationPanel
            interviewId={interview.id}
            candidateName={interview.candidate_name}
            initialEvaluation={interview.evaluation}
            onSaved={onSaved}
          />
        </div>
      </div>
    </>
  );
}
