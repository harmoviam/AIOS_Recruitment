import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import ScorePicker from './ui/ScorePicker';
import {
  INTERVIEW_SCREENING_QUESTIONS,
  categoriesForQuestions,
  type InterviewEvaluation,
  type InterviewScreeningQuestion,
} from '../types';

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function QuestionTimer({ seconds, active }: { seconds: number; active: boolean }) {
  const [remaining, setRemaining] = useState(seconds);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      setRemaining(seconds);
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      return;
    }
    setRemaining(seconds);
    intervalRef.current = window.setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          if (intervalRef.current) window.clearInterval(intervalRef.current);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, [active, seconds]);

  const done = active && remaining === 0;
  return (
    <span className={`iv-eval-timer${active ? ' active' : ''}${done ? ' done' : ''}`}>
      {active ? (done ? 'Time up' : formatTime(remaining)) : formatTime(seconds)}
    </span>
  );
}

interface InterviewEvaluationPanelProps {
  interviewId: number;
  candidateName?: string;
  jobTitle?: string | null;
  questions?: InterviewScreeningQuestion[];
  initialEvaluation?: InterviewEvaluation | null;
  compact?: boolean;
  onSaved?: (evaluation: InterviewEvaluation) => void;
}

export default function InterviewEvaluationPanel({
  interviewId,
  candidateName,
  jobTitle,
  questions: questionsProp,
  initialEvaluation,
  compact = false,
  onSaved,
}: InterviewEvaluationPanelProps) {
  const [loadedQuestions, setLoadedQuestions] = useState<InterviewScreeningQuestion[] | null>(null);
  const [loadingQuestions, setLoadingQuestions] = useState(!questionsProp);

  useEffect(() => {
    if (questionsProp) {
      setLoadedQuestions(questionsProp);
      setLoadingQuestions(false);
      return;
    }
    setLoadingQuestions(true);
    api
      .getInterviewScreeningQuestions(interviewId)
      .then((r) => {
        const mapped = r.questions.interview.map((q) => ({
          id: q.id,
          label: q.label,
          hint: q.hint,
          requirement: q.requirement,
          category: (q.category as InterviewScreeningQuestion['category']) || 'technical',
          timeSeconds: q.time_seconds,
        }));
        setLoadedQuestions(mapped);
      })
      .catch(() => setLoadedQuestions(INTERVIEW_SCREENING_QUESTIONS))
      .finally(() => setLoadingQuestions(false));
  }, [interviewId, questionsProp]);

  const questions = loadedQuestions ?? questionsProp ?? INTERVIEW_SCREENING_QUESTIONS;
  const questionIds = useMemo(() => questions.map((q) => q.id), [questions]);
  const categories = useMemo(() => categoriesForQuestions(questions), [questions]);

  const [scores, setScores] = useState<Record<string, number | null>>(() =>
    Object.fromEntries(questionIds.map((id) => [id, (initialEvaluation?.[id as keyof InterviewEvaluation] as number | null) ?? null]))
  );
  const [notes, setNotes] = useState(initialEvaluation?.notes ?? '');
  const [activeTimer, setActiveTimer] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setScores(
      Object.fromEntries(questionIds.map((id) => [id, (initialEvaluation?.[id as keyof InterviewEvaluation] as number | null) ?? null]))
    );
    setNotes(initialEvaluation?.notes ?? '');
  }, [initialEvaluation, interviewId, questionIds]);

  const totalScore = useMemo(
    () => questionIds.reduce((sum, id) => sum + (scores[id] ?? 0), 0),
    [scores, questionIds]
  );
  const questionsScored = useMemo(
    () => questionIds.filter((id) => scores[id] != null).length,
    [scores, questionIds]
  );
  const maxScore = questions.length * 5;
  const overallScore = questionsScored > 0 ? Math.round((totalScore / maxScore) * 100) / 10 : null;

  const setScore = (field: string, value: number | null) => {
    setScores((prev) => ({ ...prev, [field]: value }));
    setStatus('idle');
  };

  const save = async () => {
    setStatus('saving');
    setError(null);
    const payload = { ...scores, notes };
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const updated = await api.saveInterviewEvaluation(interviewId, payload);
        setStatus('saved');
        onSaved?.(updated.evaluation!);
        return;
      } catch (e) {
        lastError = e;
        if (attempt === 0) await new Promise((r) => setTimeout(r, 800));
      }
    }
    setError(lastError instanceof Error ? lastError.message : 'Save failed');
    setStatus('idle');
  };

  if (loadingQuestions) {
    return <div className="iv-eval-panel text-muted">Loading screening questions…</div>;
  }

  return (
    <div className={`iv-eval-panel${compact ? ' iv-eval-panel-compact' : ''}`}>
      <div className="iv-eval-header">
        <div>
          <div className="iv-eval-title">Interview Screening</div>
          {candidateName && <div className="iv-eval-subtitle">{candidateName}</div>}
          {jobTitle && (
            <div className="iv-eval-subtitle text-muted" style={{ fontSize: '0.85rem' }}>
              Questions tailored for: {jobTitle}
            </div>
          )}
        </div>
        <div className="iv-eval-totals">
          <div>
            Score <strong>{totalScore}</strong>/{maxScore}
          </div>
          {overallScore != null && (
            <div className="iv-eval-overall">
              Overall <strong>{overallScore}/10</strong>
            </div>
          )}
          <div className="text-muted" style={{ fontSize: '0.8rem' }}>
            {questionsScored}/{questions.length} rated
          </div>
        </div>
      </div>

      <p className="iv-eval-guide text-muted">
        Ask each question, rate the answer 1 (weak) to 5 (strong). Use the timer to track speaking time.
      </p>

      <div className="iv-eval-questions">
        {categories.map((cat) => {
          const catQuestions = questions.filter((q) => q.category === cat.id);
          if (catQuestions.length === 0) return null;
          return (
            <section key={cat.id} className="iv-eval-category">
              <h3 className="iv-eval-category-title">{cat.label}</h3>
              {catQuestions.map((q) => (
                <div key={q.id} className="iv-eval-row">
                  <div className="iv-eval-row-info">
                    <div className="iv-eval-row-label">
                      {q.label}
                      {q.timeSeconds != null && (
                        <button
                          type="button"
                          className="iv-eval-timer-btn"
                          onClick={() => setActiveTimer(activeTimer === q.id ? null : q.id)}
                          title="Start timer"
                        >
                          <QuestionTimer seconds={q.timeSeconds} active={activeTimer === q.id} />
                        </button>
                      )}
                    </div>
                    {q.requirement && (
                      <div className="iv-eval-row-requirement text-muted" style={{ fontSize: '0.8rem' }}>
                        JD requirement: {q.requirement}
                      </div>
                    )}
                    <div className="iv-eval-row-hint">{q.hint}</div>
                  </div>
                  <ScorePicker
                    value={scores[q.id] ?? null}
                    onChange={(v) => setScore(q.id, v)}
                    label={q.label}
                  />
                </div>
              ))}
            </section>
          );
        })}
      </div>

      {!compact && (
        <div className="iv-eval-notes">
          <label className="iv-eval-notes-label" htmlFor="iv-eval-notes">
            Recruiter notes
          </label>
          <textarea
            id="iv-eval-notes"
            className="input-field"
            rows={3}
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              setStatus('idle');
            }}
            placeholder="Additional observations…"
          />
        </div>
      )}

      {error && <div className="iv-eval-error">{error}</div>}

      <div className="iv-eval-actions">
        <button type="button" className="button-pill button-primary" onClick={save} disabled={status === 'saving'}>
          {status === 'saving' ? 'Saving…' : 'Save Screening'}
        </button>
        {status === 'saved' && <span className="text-muted">Saved ✓</span>}
        {initialEvaluation?.updated_at && status !== 'saved' && (
          <span className="text-muted">
            Last saved {new Date(initialEvaluation.updated_at).toLocaleString()}
          </span>
        )}
      </div>
    </div>
  );
}
