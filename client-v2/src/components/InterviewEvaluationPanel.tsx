import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import ScorePicker from './ui/ScorePicker';
import {
  INTERVIEW_QUESTION_IDS,
  INTERVIEW_SCREENING_CATEGORIES,
  INTERVIEW_SCREENING_QUESTIONS,
  type InterviewEvaluation,
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
  initialEvaluation?: InterviewEvaluation | null;
  compact?: boolean;
  onSaved?: (evaluation: InterviewEvaluation) => void;
}

export default function InterviewEvaluationPanel({
  interviewId,
  candidateName,
  initialEvaluation,
  compact = false,
  onSaved,
}: InterviewEvaluationPanelProps) {
  const [scores, setScores] = useState<Record<string, number | null>>(() =>
    Object.fromEntries(INTERVIEW_QUESTION_IDS.map((id) => [id, (initialEvaluation?.[id] as number | null) ?? null]))
  );
  const [notes, setNotes] = useState(initialEvaluation?.notes ?? '');
  const [activeTimer, setActiveTimer] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setScores(
      Object.fromEntries(INTERVIEW_QUESTION_IDS.map((id) => [id, (initialEvaluation?.[id] as number | null) ?? null]))
    );
    setNotes(initialEvaluation?.notes ?? '');
  }, [initialEvaluation, interviewId]);

  const totalScore = useMemo(
    () => INTERVIEW_QUESTION_IDS.reduce((sum, id) => sum + (scores[id] ?? 0), 0),
    [scores]
  );
  const questionsScored = useMemo(
    () => INTERVIEW_QUESTION_IDS.filter((id) => scores[id] != null).length,
    [scores]
  );
  const maxScore = INTERVIEW_SCREENING_QUESTIONS.length * 5;
  const overallScore = questionsScored > 0 ? Math.round((totalScore / maxScore) * 100) / 10 : null;

  const setScore = (field: string, value: number | null) => {
    setScores((prev) => ({ ...prev, [field]: value }));
    setStatus('idle');
  };

  const save = async () => {
    setStatus('saving');
    setError(null);
    try {
      const updated = await api.saveInterviewEvaluation(interviewId, { ...scores, notes });
      setStatus('saved');
      onSaved?.(updated.evaluation!);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
      setStatus('idle');
    }
  };

  return (
    <div className={`iv-eval-panel${compact ? ' iv-eval-panel-compact' : ''}`}>
      <div className="iv-eval-header">
        <div>
          <div className="iv-eval-title">Interview Screening</div>
          {candidateName && <div className="iv-eval-subtitle">{candidateName}</div>}
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
            {questionsScored}/{INTERVIEW_SCREENING_QUESTIONS.length} rated
          </div>
        </div>
      </div>

      <p className="iv-eval-guide text-muted">
        Ask each question, rate the answer 1 (weak) to 5 (strong). Use the timer to track speaking time.
      </p>

      <div className="iv-eval-questions">
        {INTERVIEW_SCREENING_CATEGORIES.map((cat) => {
          const questions = INTERVIEW_SCREENING_QUESTIONS.filter((q) => q.category === cat.id);
          if (questions.length === 0) return null;
          return (
            <section key={cat.id} className="iv-eval-category">
              <h3 className="iv-eval-category-title">{cat.label}</h3>
              {questions.map((q) => (
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
