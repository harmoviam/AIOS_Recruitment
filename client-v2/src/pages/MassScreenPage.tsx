import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import TopBar from '../components/ui/TopBar';
import PageHeader from '../components/ui/PageHeader';
import type { Job, MassScreenBatch, MassScreenSlot } from '../types';

const SLOT_COUNT = 3;
const POLL_MS = 1500;

type Step = 'upload' | 'triage';

type LocalSlot = {
  file: File | null;
  name: string;
};

function scoreClass(score: number | undefined): string {
  if (score == null) return '';
  if (score > 8) return 'mass-score-high';
  if (score >= 6) return 'mass-score-mid';
  return 'mass-score-low';
}

function slotLabel(slot: MassScreenSlot): string {
  return (
    slot.parsed_profile?.name ||
    slot.original_filename ||
    slot.filename ||
    `Resume ${slot.slot + 1}`
  );
}

export default function MassScreenPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('upload');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobId, setJobId] = useState('');
  const [slots, setSlots] = useState<LocalSlot[]>(() =>
    Array.from({ length: SLOT_COUNT }, () => ({ file: null, name: '' }))
  );
  const [batch, setBatch] = useState<MassScreenBatch | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [decidingSlot, setDecidingSlot] = useState<number | null>(null);
  const [rejectSlot, setRejectSlot] = useState<number | null>(null);
  const [rejectRemarks, setRejectRemarks] = useState('');
  const [localDecisions, setLocalDecisions] = useState<
    Record<number, { decision: 'shortlisted' | 'rejected'; remarks?: string }>
  >({});
  const fileRefs = useRef<Array<HTMLInputElement | null>>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    api.getJobs().then(setJobs).catch(() => setJobs([]));
  }, []);

  const selectedJob = useMemo(
    () => jobs.find((j) => String(j.id) === jobId) || null,
    [jobs, jobId]
  );

  const mandatoryCount = selectedJob?.required_skills?.length ?? 0;
  const filledCount = slots.filter((s) => s.file).length;

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const refreshBatch = useCallback(
    async (batchId: string) => {
      try {
        const next = await api.getMassScreenBatch(batchId);
        setBatch(next);
        const stillWorking = next.slots.some(
          (s) =>
            s.status === 'queued' ||
            s.status === 'parsing' ||
            s.ai_status === 'pending'
        );
        if (!stillWorking || next.status === 'completed') {
          stopPolling();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to refresh batch');
        stopPolling();
      }
    },
    [stopPolling]
  );

  const startScan = async () => {
    setError('');
    if (!selectedJob) {
      setError('Select a job to screen against.');
      return;
    }
    if (mandatoryCount === 0) {
      setError('Selected job needs at least one mandatory skill. Edit the job first.');
      return;
    }
    const filesBySlot = slots
      .map((s, i) => (s.file ? { slot: i, file: s.file } : null))
      .filter((x): x is { slot: number; file: File } => Boolean(x));
    if (filesBySlot.length === 0) {
      setError('Upload at least one resume.');
      return;
    }

    setSubmitting(true);
    try {
      const created = await api.startMassScreen(selectedJob.id, filesBySlot);
      setBatch(created);
      setLocalDecisions({});
      setStep('triage');
      stopPolling();
      pollRef.current = setInterval(() => {
        void refreshBatch(created.id);
      }, POLL_MS);
      void refreshBatch(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start mass screen');
    } finally {
      setSubmitting(false);
    }
  };

  const setFileAt = (index: number, file: File | null) => {
    setSlots((prev) => {
      const next = [...prev];
      next[index] = { file, name: file?.name || '' };
      return next;
    });
  };

  const actionableSlots = useMemo(() => {
    if (!batch) return [];
    return batch.slots.filter((s) => s.status === 'scored' || s.status === 'decided');
  }, [batch]);

  const decidedCount = useMemo(() => {
    if (!batch) return 0;
    return batch.slots.filter((s) => s.status === 'decided' || localDecisions[s.slot]).length;
  }, [batch, localDecisions]);

  const pendingDecideCount = actionableSlots.filter(
    (s) => s.status !== 'decided' && !localDecisions[s.slot]
  ).length;

  const applyDecision = async (
    slot: number,
    decision: 'shortlisted' | 'rejected',
    remarks?: string
  ) => {
    if (!batch) return;
    setError('');
    setDecidingSlot(slot);
    try {
      const updated = await api.decideMassScreen(batch.id, [{ slot, decision, remarks }]);
      setBatch(updated);
      setLocalDecisions((prev) => ({ ...prev, [slot]: { decision, remarks } }));
      setRejectSlot(null);
      setRejectRemarks('');
      if (updated.status === 'completed') stopPolling();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save decision');
    } finally {
      setDecidingSlot(null);
    }
  };

  const allDecided =
    actionableSlots.length > 0 &&
    actionableSlots.every((s) => s.status === 'decided' || localDecisions[s.slot]);

  return (
    <>
      <TopBar breadcrumbs={[{ label: 'Candidates', href: '/candidates' }, { label: 'Mass screen' }]} />
      <div className="page-content">
        <PageHeader
          title="Mass Resume Screening"
          description="Upload up to 3 resumes against a JD. Candidates below the job's min experience are auto-rejected (ATS/eligibility skipped). Others are scored for Shortlist or Reject."
          actions={
            <Link to="/candidates" className="button-pill button-secondary">
              Back to candidates
            </Link>
          }
        />

        {error && (
          <div className="card mass-screen-error" role="alert">
            {error}
          </div>
        )}

        {step === 'upload' && (
          <div className="card mass-screen-upload">
            <label className="field-label" htmlFor="mass-job">
              Job (JD)
            </label>
            <select
              id="mass-job"
              className="input-field"
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
            >
              <option value="">Select a job…</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title} — {j.client}
                  {(j.required_skills?.length ?? 0) === 0 ? ' (add mandatory skills)' : ''}
                </option>
              ))}
            </select>

            {selectedJob && (
              <div className="mass-job-skills text-muted">
                <div>
                  <strong>Mandatory:</strong>{' '}
                  {(selectedJob.required_skills || []).join(', ') || '— none —'}
                </div>
                <div>
                  <strong>Preferred:</strong>{' '}
                  {(selectedJob.preferred_skills || []).join(', ') || '— none —'}
                </div>
                <div>
                  <strong>Min experience:</strong>{' '}
                  {selectedJob.min_experience != null && Number(selectedJob.min_experience) > 0
                    ? `${selectedJob.min_experience}+ years (hard gate)`
                    : '— not set —'}
                </div>
              </div>
            )}

            <h3 className="card-heading" style={{ marginTop: '1.25rem' }}>
              Resume slots ({filledCount}/{SLOT_COUNT})
            </h3>
            <p className="text-muted" style={{ marginBottom: '0.75rem' }}>
              Use each button to attach one PDF/DOC/DOCX. Scoring starts when you click Scan &amp; score.
            </p>

            <div className="mass-slot-grid">
              {slots.map((slot, i) => (
                <div key={i} className={`mass-slot-card ${slot.file ? 'has-file' : ''}`}>
                  <div className="mass-slot-index">#{i + 1}</div>
                  <button
                    type="button"
                    className="button-pill button-secondary"
                    onClick={() => fileRefs.current[i]?.click()}
                  >
                    {slot.file ? 'Replace file' : 'Upload resume'}
                  </button>
                  <input
                    ref={(el) => {
                      fileRefs.current[i] = el;
                    }}
                    type="file"
                    accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0] || null;
                      setFileAt(i, f);
                      e.target.value = '';
                    }}
                  />
                  <div className="mass-slot-name" title={slot.name}>
                    {slot.name || 'No file'}
                  </div>
                  {slot.file && (
                    <button
                      type="button"
                      className="text-link"
                      onClick={() => setFileAt(i, null)}
                    >
                      Clear
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="mass-screen-actions">
              <button
                type="button"
                className="button-pill button-primary"
                disabled={submitting || filledCount === 0 || !jobId}
                onClick={() => void startScan()}
              >
                {submitting ? 'Uploading…' : `Scan & score (${filledCount})`}
              </button>
            </div>
          </div>
        )}

        {step === 'triage' && batch && (
          <div className="mass-screen-triage">
            <div className="card mass-triage-summary">
              <div>
                Screening for <strong>{selectedJob?.title || `Job #${batch.job_id}`}</strong>
              </div>
              <div className="text-muted">
                Batch status: {batch.status} · Decided {decidedCount} / {actionableSlots.length || '—'}
                {pendingDecideCount > 0 ? ` · ${pendingDecideCount} remaining` : ''}
              </div>
              <p className="text-muted" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
                Shortlist requires Eligibility &gt; 8. Reject always requires remarks. Resumes below the
                job&apos;s min experience are auto-rejected (no ATS or eligibility score). You can decide
                as soon as a row is scored — AI notes may fill in later.
              </p>
              {selectedJob?.min_experience != null && Number(selectedJob.min_experience) > 0 ? (
                <p className="text-muted" style={{ marginTop: '0.35rem', marginBottom: 0 }}>
                  Min experience for this job: {selectedJob.min_experience}+ years
                </p>
              ) : null}
            </div>

            <div className="mass-triage-list">
              {batch.slots
                .slice()
                .sort((a, b) => a.slot - b.slot)
                .map((slot) => {
                  const decided = slot.status === 'decided' || Boolean(localDecisions[slot.slot]);
                  const decision = slot.decision || localDecisions[slot.slot]?.decision;
                  const canShortlist =
                    slot.status === 'scored' &&
                    !decided &&
                    !slot.experience_rejected &&
                    (slot.eligibility_score ?? 0) > 8;
                  // Experience rejects are normally auto-decided; allow manual reject if that failed.
                  const canReject = slot.status === 'scored' && !decided;
                  const eligibleHighlight =
                    !slot.experience_rejected && (slot.eligibility_score ?? 0) > 8;

                  return (
                    <div
                      key={slot.slot}
                      className={`card mass-triage-row ${eligibleHighlight ? 'eligible' : ''} ${
                        decided ? 'decided' : ''
                      } ${slot.experience_rejected ? 'experience-rejected' : ''}`}
                    >
                      <div className="mass-triage-main">
                        <div className="mass-triage-title">
                          <span className="mass-slot-index">#{slot.slot + 1}</span>
                          <strong>{slotLabel(slot)}</strong>
                          {slot.status === 'queued' || slot.status === 'parsing' ? (
                            <span className="text-muted"> · {slot.status}…</span>
                          ) : null}
                          {slot.status === 'error' ? (
                            <span className="mass-error-inline"> · {slot.error || 'Error'}</span>
                          ) : null}
                          {decided ? (
                            <span className={`mass-decision-badge ${decision}`}>
                              {decision === 'shortlisted'
                                ? 'Shortlisted'
                                : slot.experience_rejected
                                  ? 'Rejected (experience)'
                                  : 'Rejected'}
                            </span>
                          ) : null}
                        </div>

                        {slot.experience_rejected ? (
                          <div className="mass-exp-gate">
                            <span className="mass-score mass-score-low">Experience gate failed</span>
                            <p className="mass-ai-summary" style={{ marginBottom: 0 }}>
                              {slot.experience_gate?.reason ||
                                slot.remarks ||
                                'Below minimum years of experience — ATS and eligibility skipped.'}
                              {slot.experience_years != null
                                ? ` (${slot.experience_years} yrs)`
                                : ''}
                            </p>
                          </div>
                        ) : null}

                        {slot.experience_consistency?.mismatch ? (
                          <div className="mass-exp-gate">
                            <span className="mass-score mass-score-mid">Experience inconsistency</span>
                            <p className="mass-ai-summary" style={{ marginBottom: 0 }}>
                              {slot.experience_consistency.reason}
                            </p>
                          </div>
                        ) : null}

                        {slot.experience_consistency &&
                        !slot.experience_consistency.mismatch &&
                        slot.experience_consistency.employment_years != null &&
                        !slot.experience_rejected ? (
                          <p className="text-muted" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
                            Employment history: {slot.experience_consistency.employment_years} yrs
                            {slot.experience_consistency.roles.length > 1
                              ? ` across ${slot.experience_consistency.roles.length} roles`
                              : ''}
                            {slot.experience_consistency.claimed_years != null
                              ? ` · Summary: ${slot.experience_consistency.claimed_years} yrs`
                              : ''}
                          </p>
                        ) : null}

                        {(slot.status === 'scored' || slot.status === 'decided') &&
                        !slot.experience_rejected ? (
                          <>
                            <div className="mass-score-row">
                              <span className={`mass-score ${scoreClass(slot.ats_score_10)}`}>
                                ATS {slot.ats_score_10?.toFixed(1) ?? '—'}/10
                              </span>
                              <span className={`mass-score ${scoreClass(slot.eligibility_score)}`}>
                                Eligibility {slot.eligibility_score?.toFixed(1) ?? '—'}/10
                              </span>
                              {slot.experience_years != null ? (
                                <span className="text-muted">{slot.experience_years} yrs exp</span>
                              ) : null}
                              {slot.ai_status === 'pending' ? (
                                <span className="text-muted">AI enriching…</span>
                              ) : null}
                            </div>

                            {slot.eligibility && (
                              <div className="mass-skill-chips">
                                {slot.eligibility.mandatory_matched.map((s) => (
                                  <span key={`mm-${s}`} className="chip chip-ok">
                                    M: {s}
                                  </span>
                                ))}
                                {slot.eligibility.mandatory_missing.map((s) => (
                                  <span key={`mx-${s}`} className="chip chip-miss">
                                    M missing: {s}
                                  </span>
                                ))}
                                {slot.eligibility.preferred_matched.map((s) => (
                                  <span key={`pm-${s}`} className="chip chip-ok">
                                    P: {s}
                                  </span>
                                ))}
                                {slot.eligibility.preferred_missing.map((s) => (
                                  <span key={`px-${s}`} className="chip chip-miss">
                                    P missing: {s}
                                  </span>
                                ))}
                              </div>
                            )}

                            {slot.ai_summary ? (
                              <p className="mass-ai-summary">{slot.ai_summary}</p>
                            ) : null}
                            {slot.remarks || localDecisions[slot.slot]?.remarks ? (
                              <p className="text-muted">
                                Remarks: {slot.remarks || localDecisions[slot.slot]?.remarks}
                              </p>
                            ) : null}
                          </>
                        ) : null}

                        {slot.status === 'decided' &&
                        slot.experience_rejected &&
                        (slot.remarks || localDecisions[slot.slot]?.remarks) ? (
                          <p className="text-muted">
                            Remarks: {slot.remarks || localDecisions[slot.slot]?.remarks}
                          </p>
                        ) : null}
                      </div>

                      {(canShortlist || canReject) && (
                        <div className="mass-triage-actions">
                          <button
                            type="button"
                            className="button-pill button-primary"
                            disabled={!canShortlist || decidingSlot === slot.slot}
                            title={
                              canShortlist
                                ? 'Move to Screening (Shortlisted)'
                                : 'Eligibility must be greater than 8'
                            }
                            onClick={() => void applyDecision(slot.slot, 'shortlisted')}
                          >
                            Shortlist
                          </button>
                          <button
                            type="button"
                            className="button-pill button-secondary"
                            disabled={!canReject || decidingSlot === slot.slot}
                            onClick={() => {
                              setRejectSlot(slot.slot);
                              setRejectRemarks(
                                slot.experience_rejected
                                  ? slot.remarks ||
                                      slot.experience_gate?.reason ||
                                      'Insufficient experience'
                                  : ''
                              );
                            }}
                          >
                            Reject
                          </button>
                        </div>
                      )}

                      {rejectSlot === slot.slot && (
                        <div className="mass-reject-box">
                          <label className="field-label" htmlFor={`reject-${slot.slot}`}>
                            Rejection remarks (required)
                          </label>
                          <textarea
                            id={`reject-${slot.slot}`}
                            className="input-field"
                            rows={3}
                            value={rejectRemarks}
                            onChange={(e) => setRejectRemarks(e.target.value)}
                            placeholder="Why is this candidate rejected?"
                          />
                          <div className="mass-screen-actions">
                            <button
                              type="button"
                              className="button-pill button-primary"
                              disabled={!rejectRemarks.trim() || decidingSlot === slot.slot}
                              onClick={() =>
                                void applyDecision(slot.slot, 'rejected', rejectRemarks.trim())
                              }
                            >
                              Confirm reject
                            </button>
                            <button
                              type="button"
                              className="button-pill button-secondary"
                              onClick={() => setRejectSlot(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>

            <div className="mass-screen-actions sticky-footer">
              <button
                type="button"
                className="button-pill button-secondary"
                onClick={() => {
                  stopPolling();
                  setStep('upload');
                  setBatch(null);
                }}
              >
                Screen another batch
              </button>
              <button
                type="button"
                className="button-pill button-primary"
                disabled={!allDecided}
                title={allDecided ? 'All decisions saved' : 'Decide every successful resume first'}
                onClick={() => navigate('/candidates')}
              >
                Complete
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
