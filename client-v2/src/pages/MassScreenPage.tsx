import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import TopBar from '../components/ui/TopBar';
import PageHeader from '../components/ui/PageHeader';
import { useAuth } from '../context/AuthContext';
import type { Job, MassScreenBatch, MassScreenSlot } from '../types';

const SLOT_COUNT = 3;
const POLL_MS = 1500;
const EMAIL_SIGNER_KEY = 'mass_screen_email_signer';

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

function cleanName(value: string | null | undefined): string {
  const trimmed = (value || '').trim();
  if (!trimmed) return '';
  // Ignore generic placeholders parsers sometimes emit
  if (/^(unknown|n\/?a|null|candidate|resume|curriculum\s*vitae|cv)$/i.test(trimmed)) return '';
  return trimmed;
}

function looksLikeOrgAdminName(name: string): boolean {
  return /\badmin\b/i.test(name) || /^earlyjobs\b/i.test(name);
}

function resolveDefaultSigner(user: { name?: string; role?: string } | null): string {
  try {
    const saved = localStorage.getItem(EMAIL_SIGNER_KEY)?.trim();
    if (saved) return saved;
  } catch {
    /* ignore */
  }
  const name = (user?.name || '').trim();
  if (!name) return '';
  if (user?.role === 'recruiter' || user?.role === 'hiring_manager') return name;
  // Avoid signing candidate emails as "EarlyJobs Admin" / similar org accounts
  if (looksLikeOrgAdminName(name)) return '';
  return name;
}

function candidateDisplayName(slot: MassScreenSlot): string {
  return (
    cleanName(slot.parsed_profile?.name) ||
    cleanName(slot.original_filename) ||
    cleanName(slot.filename) ||
    `Candidate #${slot.slot + 1}`
  );
}

function candidateIdentityMeta(slot: MassScreenSlot): string[] {
  const parts: string[] = [];
  const email = cleanName(slot.parsed_profile?.email);
  const phone = cleanName(slot.parsed_profile?.phone);
  const file = cleanName(slot.original_filename || slot.filename);
  const name = cleanName(slot.parsed_profile?.name);
  if (email) parts.push(email);
  if (phone) parts.push(phone);
  // Show filename when we have a real person name (so file ≠ the only identity)
  if (file && name && file.toLowerCase() !== name.toLowerCase()) parts.push(file);
  return parts;
}

function firstName(fullName: string): string {
  const token = fullName.trim().split(/\s+/)[0] || fullName;
  // Avoid greeting with a filename
  if (/\.(pdf|docx?|txt)$/i.test(token) || /^candidate\s*#?\d+$/i.test(fullName)) return 'there';
  return token;
}

type SkillGapEmail = {
  to: string;
  subject: string;
  body: string;
  fullText: string;
};

function buildSkillGapEmail(opts: {
  candidateName: string;
  candidateEmail?: string | null;
  jobTitle: string;
  missingMandatory: string[];
  matchedMandatory?: string[];
  signerName?: string | null;
}): SkillGapEmail | null {
  const missing = opts.missingMandatory.map((s) => s.trim()).filter(Boolean);
  if (missing.length === 0) return null;

  const jobTitle = opts.jobTitle.trim() || 'the open role';
  const greet = firstName(opts.candidateName);
  const missingList = missing.map((s) => `• ${s}`).join('\n');
  const matched = (opts.matchedMandatory || []).map((s) => s.trim()).filter(Boolean);
  const matchedLine =
    matched.length > 0
      ? `\nWe did note relevant experience with: ${matched.join(', ')}.\n`
      : '';
  const signer = (opts.signerName || '').trim() || 'Recruiting Team';

  const subject = `Quick clarification on your application — ${jobTitle}`;
  const body = `Hi ${greet},

Thank you for applying for the ${jobTitle} role.

While reviewing your profile, we could not clearly find the following mandatory skill${missing.length === 1 ? '' : 's'} on your resume:

${missingList}
${matchedLine}
If you do have experience with ${missing.length === 1 ? 'this' : 'these'}, please reply with a short note (or an updated resume) so we can continue evaluating your application.

Looking forward to your response at earliest.

Best regards,
${signer}`;

  const to = cleanName(opts.candidateEmail);
  const fullText = [
    to ? `To: ${to}` : null,
    `Subject: ${subject}`,
    '',
    body,
  ]
    .filter((line) => line != null)
    .join('\n');

  return { to, subject, body, fullText };
}

export default function MassScreenPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
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
  const [copiedEmailKey, setCopiedEmailKey] = useState<string | null>(null);
  const [emailSigner, setEmailSigner] = useState('');
  const [localDecisions, setLocalDecisions] = useState<
    Record<number, { decision: 'shortlisted' | 'rejected'; remarks?: string }>
  >({});
  const fileRefs = useRef<Array<HTMLInputElement | null>>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    api.getJobs().then(setJobs).catch(() => setJobs([]));
  }, []);

  useEffect(() => {
    if (!user) return;
    setEmailSigner((prev) => (prev.trim() ? prev : resolveDefaultSigner(user)));
  }, [user]);

  const updateEmailSigner = (value: string) => {
    setEmailSigner(value);
    try {
      const trimmed = value.trim();
      if (trimmed) localStorage.setItem(EMAIL_SIGNER_KEY, trimmed);
      else localStorage.removeItem(EMAIL_SIGNER_KEY);
    } catch {
      /* ignore */
    }
  };

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

  const jobTitleForEmail = selectedJob?.title || (batch ? `Job #${batch.job_id}` : 'the open role');

  const skillGapEmails = useMemo(() => {
    if (!batch) return [] as Array<{ slot: number; name: string; draft: SkillGapEmail }>;
    return batch.slots
      .slice()
      .sort((a, b) => a.slot - b.slot)
      .flatMap((slot) => {
        const missing = slot.eligibility?.mandatory_missing || [];
        if (
          missing.length === 0 ||
          slot.experience_rejected ||
          (slot.status !== 'scored' && slot.status !== 'decided')
        ) {
          return [];
        }
        const draft = buildSkillGapEmail({
          candidateName: candidateDisplayName(slot),
          candidateEmail: slot.parsed_profile?.email,
          jobTitle: jobTitleForEmail,
          missingMandatory: missing,
          matchedMandatory: slot.eligibility?.mandatory_matched,
          signerName: emailSigner,
        });
        if (!draft) return [];
        return [{ slot: slot.slot, name: candidateDisplayName(slot), draft }];
      });
  }, [batch, jobTitleForEmail, emailSigner]);

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedEmailKey(key);
      window.setTimeout(() => {
        setCopiedEmailKey((current) => (current === key ? null : current));
      }, 2000);
    } catch {
      setError('Could not copy to clipboard. Select the text and copy manually.');
    }
  };

  const openMailto = (draft: SkillGapEmail) => {
    if (!draft.to) {
      setError('No email on the resume for this candidate — copy the draft and send manually.');
      return;
    }
    const href = `mailto:${draft.to}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`;
    window.location.href = href;
  };

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
              {skillGapEmails.length > 0 ? (
                <div className="mass-gap-email-summary">
                  <p style={{ margin: '0 0 0.5rem' }}>
                    <strong>{skillGapEmails.length}</strong> candidate
                    {skillGapEmails.length === 1 ? '' : 's'} missing mandatory skill
                    {skillGapEmails.length === 1 ? '' : 's'} — drafts ready to send for clarification.
                  </p>
                  <label className="field-label" htmlFor="mass-email-signer">
                    Sign emails as (recruiter name)
                  </label>
                  <input
                    id="mass-email-signer"
                    className="input-field"
                    value={emailSigner}
                    onChange={(e) => updateEmailSigner(e.target.value)}
                    placeholder="e.g. Priya Verma"
                    autoComplete="name"
                  />
                  <p className="text-muted" style={{ margin: '0.35rem 0 0.65rem', fontSize: '0.8rem' }}>
                    Used in the “Best regards” line. Saved for next time on this browser.
                  </p>
                  <button
                    type="button"
                    className="button-pill button-secondary btn-sm"
                    onClick={() =>
                      void copyText(
                        'all-gap-emails',
                        skillGapEmails
                          .map(
                            ({ name, draft }) =>
                              `—— ${name} ——\n${draft.fullText}`
                          )
                          .join('\n\n')
                      )
                    }
                  >
                    {copiedEmailKey === 'all-gap-emails'
                      ? '✓ All drafts copied'
                      : 'Copy all skill-gap emails'}
                  </button>
                </div>
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
                  const displayName = candidateDisplayName(slot);
                  const identityMeta = candidateIdentityMeta(slot);
                  const skillGapDraft =
                    !slot.experience_rejected &&
                    (slot.status === 'scored' || slot.status === 'decided') &&
                    (slot.eligibility?.mandatory_missing?.length ?? 0) > 0
                      ? buildSkillGapEmail({
                          candidateName: displayName,
                          candidateEmail: slot.parsed_profile?.email,
                          jobTitle: jobTitleForEmail,
                          missingMandatory: slot.eligibility!.mandatory_missing,
                          matchedMandatory: slot.eligibility?.mandatory_matched,
                          signerName: emailSigner,
                        })
                      : null;

                  return (
                    <div
                      key={slot.slot}
                      className={`card mass-triage-row ${eligibleHighlight ? 'eligible' : ''} ${
                        decided ? 'decided' : ''
                      } ${slot.experience_rejected ? 'experience-rejected' : ''}`}
                    >
                      <div className="mass-triage-main">
                        <div className="mass-triage-identity">
                          <div className="mass-triage-title">
                            <span className="mass-slot-badge">Slot {slot.slot + 1}</span>
                            <h3 className="mass-candidate-name">{displayName}</h3>
                            {slot.status === 'queued' || slot.status === 'parsing' ? (
                              <span className="text-muted">{slot.status}…</span>
                            ) : null}
                            {slot.status === 'error' ? (
                              <span className="mass-error-inline">{slot.error || 'Error'}</span>
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
                          {identityMeta.length > 0 ? (
                            <div className="mass-candidate-meta">{identityMeta.join(' · ')}</div>
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
                              <div className="mass-skill-sections" aria-label={`Skills for ${displayName}`}>
                                <div className="mass-skill-group">
                                  <div className="mass-skill-group-label">Mandatory</div>
                                  <div className="mass-skill-chips">
                                    {slot.eligibility.mandatory_matched.length === 0 &&
                                    slot.eligibility.mandatory_missing.length === 0 ? (
                                      <span className="text-muted">—</span>
                                    ) : null}
                                    {slot.eligibility.mandatory_matched.map((s) => (
                                      <span key={`mm-${s}`} className="chip chip-ok">
                                        {s}
                                      </span>
                                    ))}
                                    {slot.eligibility.mandatory_missing.map((s) => (
                                      <span key={`mx-${s}`} className="chip chip-miss">
                                        Missing: {s}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                                <div className="mass-skill-group">
                                  <div className="mass-skill-group-label">Preferred</div>
                                  <div className="mass-skill-chips">
                                    {slot.eligibility.preferred_matched.length === 0 &&
                                    slot.eligibility.preferred_missing.length === 0 ? (
                                      <span className="text-muted">—</span>
                                    ) : null}
                                    {slot.eligibility.preferred_matched.map((s) => (
                                      <span key={`pm-${s}`} className="chip chip-ok">
                                        {s}
                                      </span>
                                    ))}
                                    {slot.eligibility.preferred_missing.map((s) => (
                                      <span key={`px-${s}`} className="chip chip-miss">
                                        Missing: {s}
                                      </span>
                                    ))}
                                  </div>
                                </div>
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

                            {skillGapDraft ? (
                              <details className="mass-gap-email" open>
                                <summary>
                                  Email draft — clarify missing mandatory skill
                                  {slot.eligibility!.mandatory_missing.length === 1 ? '' : 's'}
                                </summary>
                                <div className="mass-gap-email-meta text-muted">
                                  {skillGapDraft.to
                                    ? `To: ${skillGapDraft.to}`
                                    : 'No email on resume — copy and send manually'}
                                  <br />
                                  Subject: {skillGapDraft.subject}
                                </div>
                                <pre className="mass-gap-email-body">{skillGapDraft.body}</pre>
                                <div className="mass-gap-email-actions">
                                  <button
                                    type="button"
                                    className="button-pill button-secondary btn-sm"
                                    onClick={() =>
                                      void copyText(`body-${slot.slot}`, skillGapDraft.body)
                                    }
                                  >
                                    {copiedEmailKey === `body-${slot.slot}`
                                      ? '✓ Body copied'
                                      : 'Copy body'}
                                  </button>
                                  <button
                                    type="button"
                                    className="button-pill button-secondary btn-sm"
                                    onClick={() =>
                                      void copyText(`full-${slot.slot}`, skillGapDraft.fullText)
                                    }
                                  >
                                    {copiedEmailKey === `full-${slot.slot}`
                                      ? '✓ Copied'
                                      : 'Copy full email'}
                                  </button>
                                  <button
                                    type="button"
                                    className="button-pill button-primary btn-sm"
                                    disabled={!skillGapDraft.to}
                                    title={
                                      skillGapDraft.to
                                        ? 'Open in your email client'
                                        : 'No candidate email on file'
                                    }
                                    onClick={() => openMailto(skillGapDraft)}
                                  >
                                    Open in email
                                  </button>
                                </div>
                              </details>
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
