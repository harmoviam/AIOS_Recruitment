import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import type { PublicJob } from '../../types';
import { POPULAR_CITIES } from './careers';
import { IconCheck, IconDoc, IconUpload, IconX } from './icons';

interface ApplicationWizardProps {
  open: boolean;
  job: PublicJob;
  tenantSlug: string;
  defaultCity?: string;
  onClose: () => void;
}

interface Profile {
  name: string;
  email: string;
  phone: string;
  city: string;
  education: string;
  experience: string;
  currentRole: string;
}

const EMPTY_PROFILE: Profile = { name: '', email: '', phone: '', city: '', education: '', experience: '', currentRole: '' };

function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem('careers_profile');
    if (raw) return { ...EMPTY_PROFILE, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return EMPTY_PROFILE;
}

function saveProfile(p: Profile) {
  try {
    localStorage.setItem('careers_profile', JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

const STEPS = ['Your details', 'Experience', 'Skills & resume'];

/** Multi-step application flow integrated with the real apply API. */
export default function ApplicationWizard({ open, job, tenantSlug, defaultCity, onClose }: ApplicationWizardProps) {
  const [profile, setProfile] = useState<Profile>(() => ({ ...EMPTY_PROFILE, city: defaultCity || '' }));
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [skills, setSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState('');
  const [resume, setResume] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [prefilled, setPrefilled] = useState<Profile | null>(null);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    const saved = loadProfile();
    setPrefilled(saved);
    setProfile((prev) => ({ ...prev, ...saved, city: prev.city || saved.city }));
    setErrors({});
    setSubmitError(null);
    setStep(0);
    return () => {
      document.body.style.overflow = '';
    };
  }, [open, job.id]);

  const cityOptions = useMemo(() => Array.from(new Set([...POPULAR_CITIES.map((c) => c.city), ...Array.from(new Set([job.city, job.location].filter(Boolean).map((c) => c!)))]).values()), [job]);

  const set = (patch: Partial<Profile>) => setProfile((prev) => ({ ...prev, ...patch }));

  const validateStep = (): boolean => {
    const next: Record<string, string> = {};
    if (step === 0) {
      if (!profile.name.trim()) next.name = 'Please tell us your name.';
      const email = profile.email.trim().toLowerCase();
      const phone = profile.phone.trim();
      if (!email && !phone) next.email = 'Add an email or phone so we can reach you.';
      else if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) next.email = 'That email address doesn’t look right.';
      else if (phone && !/^\+?[\d\s-]{10,}$/.test(phone)) next.phone = 'That phone number doesn’t look right.';
    } else if (step === 1) {
      const exp = profile.experience.trim();
      if (exp && (!Number.isFinite(Number(exp)) || Number(exp) < 0 || Number(exp) > 50)) {
        next.experience = 'Enter total years of experience (0–50).';
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const next = () => {
    if (!validateStep()) return;
    if (step === 1) saveProfile(profile);
    setStep((s) => Math.min(s + 1, 2));
    setSubmitError(null);
  };

  const back = () => {
    setSubmitError(null);
    setStep((s) => Math.max(s - 1, 0));
  };

  const addSkill = () => {
    const s = skillInput.trim();
    if (s && !skills.includes(s)) {
      setSkills((prev) => [...prev, s].slice(0, 20));
    }
    setSkillInput('');
  };

  const pickFile = (file: File | undefined | null) => {
    if (!file) return;
    const name = file.name.toLowerCase();
    if (!/\.(pdf|doc|docx)$/.test(name) && !['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(file.type)) {
      setSubmitError('Resume must be PDF, DOC, or DOCX.');
      return;
    }
    setSubmitError(null);
    setResume(file);
  };

  const submit = async () => {
    if (!validateSubmit()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const experience = profile.experience.trim() === '' ? undefined : Number(profile.experience);
      await api.careersApply(tenantSlug, job.id, {
        name: profile.name.trim(),
        email: profile.email.trim().toLowerCase(),
        phone: profile.phone.trim(),
        city: profile.city.trim() || undefined,
        education: profile.education.trim() || undefined,
        experience,
        currentRole: profile.currentRole.trim() || undefined,
        skills,
        resume,
      });
      saveProfile(profile);
      setStep(3);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong submitting your application. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const validateSubmit = (): boolean => {
    const next: Record<string, string> = {};
    if (step === 2) {
      if (skills.some((s) => s.length > 48)) next.skills = 'One of your skills is too long.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  if (!open) return null;
  const success = step === 3;

  return (
    <div className="careers-wizard" role="dialog" aria-modal="true" aria-label={`Apply to ${job.title}`}>
      <div className="careers-wizard-panel">
        <div className="careers-wizard-head">
          <div style={{ minWidth: 0 }}>
            <h3 className="careers-wizard-title">{success ? 'Application sent' : `Apply: ${job.title}`}</h3>
            <div className="careers-wizard-sub">
              {success ? job.title : `${STEPS[step]} · step ${step + 1} of ${STEPS.length}`}
            </div>
          </div>
          <button type="button" className="careers-wizard-close" onClick={onClose} aria-label="Close application form">
            <IconX />
          </button>
        </div>

        {!success && (
          <div className="careers-steps" aria-label="Application progress">
            {STEPS.map((label, i) => (
              <span key={label} className={`careers-step${i === step ? ' is-current' : i < step ? ' is-done' : ''}`} aria-hidden="true" />
            ))}
          </div>
        )}

        <div className="careers-wizard-body">
          {success ? (
            <div className="careers-success">
              <span className="careers-success-icon">
                <IconCheck />
              </span>
              <h3>You’re in!</h3>
              <p>
                Thanks{profile.name.split(' ')[0] ? ', ' + profile.name.split(' ')[0] : ''}! Your application for{' '}
                <strong>{job.title}</strong> has been received. Recruiters review applications as they arrive and will
                reach out directly if you’re shortlisted.
              </p>
              {!prefilled && (
                <p style={{ marginTop: 10, fontSize: 13 }}>
                  Tip: your details are saved on this device so returning visitors can apply to future roles in one tap.
                </p>
              )}
            </div>
          ) : (
            <div className="careers-form">
              {step === 0 && (
                <div className="careers-info-grid">
                  <div className="careers-field">
                    <label htmlFor="cw-name">Full name <span className="careers-required">*</span></label>
                    <input
                      id="cw-name"
                      className={`careers-input ${errors.name ? 'careers-invalid' : ''}`}
                      value={profile.name}
                      onChange={(e) => set({ name: e.target.value })}
                      placeholder="As on your resume"
                      autoComplete="name"
                    />
                    {errors.name && <span className="careers-field-error">{errors.name}</span>}
                  </div>
                  <div className="careers-field">
                    <label htmlFor="cw-city">City (optional)</label>
                    <input
                      id="cw-city"
                      className="careers-input"
                      value={profile.city}
                      onChange={(e) => set({ city: e.target.value })}
                      placeholder="Where do you live?"
                      list="careers-city-datalist"
                      autoComplete="address-level2"
                    />
                  </div>
                  <div className="careers-field">
                    <label htmlFor="cw-email">Email <span className="careers-required">*</span></label>
                    <input
                      id="cw-email"
                      type="email"
                      className={`careers-input ${errors.email ? 'careers-invalid' : ''}`}
                      value={profile.email}
                      onChange={(e) => set({ email: e.target.value })}
                      placeholder="you@example.com"
                      autoComplete="email"
                    />
                    {errors.email && <span className="careers-field-error">{errors.email}</span>}
                  </div>
                  <div className="careers-field">
                    <label htmlFor="cw-phone">Phone (optional)</label>
                    <input
                      id="cw-phone"
                      type="tel"
                      className={`careers-input ${errors.phone ? 'careers-invalid' : ''}`}
                      value={profile.phone}
                      onChange={(e) => set({ phone: e.target.value })}
                      placeholder="+91 98765 43210"
                      autoComplete="tel"
                    />
                    {errors.phone && <span className="careers-field-error">{errors.phone}</span>}
                  </div>
                  <datalist id="careers-city-datalist">
                    {cityOptions.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                  <p className="careers-muted" style={{ fontSize: 12.5, gridColumn: '1 / -1' }}>Email or phone is enough — we’ll use it only for this application.</p>
                </div>
              )}

              {step === 1 && (
                <div className="careers-info-grid">
                  <div className="careers-field">
                    <label htmlFor="cw-role">Current / most recent role (optional)</label>
                    <input
                      id="cw-role"
                      className="careers-input"
                      value={profile.currentRole}
                      onChange={(e) => set({ currentRole: e.target.value })}
                      placeholder="e.g. Software Engineer"
                    />
                  </div>
                  <div className="careers-field">
                    <label htmlFor="cw-exp">Total experience (years, optional)</label>
                    <input
                      id="cw-exp"
                      type="number"
                      min={0}
                      max={50}
                      step={0.5}
                      className={`careers-input ${errors.experience ? 'careers-invalid' : ''}`}
                      value={profile.experience}
                      onChange={(e) => set({ experience: e.target.value })}
                      placeholder="e.g. 3"
                    />
                    {errors.experience && <span className="careers-field-error">{errors.experience}</span>}
                  </div>
                  <div className="careers-field" style={{ gridColumn: '1 / -1' }}>
                    <label htmlFor="cw-edu">Highest qualification (optional)</label>
                    <select
                      id="cw-edu"
                      className="careers-select"
                      value={profile.education}
                      onChange={(e) => set({ education: e.target.value })}
                    >
                      <option value="">Select…</option>
                      {['10th / SSC', '12th / HSC', 'Diploma', 'Graduation', 'Post Graduation', 'Doctorate', 'Other'].map((o) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {step === 2 && (
                <>
                  <div className="careers-field">
                    <span className="careers-field-label">Key skills (optional)</span>
                    <div className="careers-skill-input-wrap">
                      <input
                        className="careers-input"
                        value={skillInput}
                        onChange={(e) => setSkillInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ',') {
                            e.preventDefault();
                            addSkill();
                          }
                        }}
                        placeholder="e.g. React, Communication, Sales"
                        aria-label="Add a skill"
                      />
                      <button type="button" className="careers-btn careers-btn-primary careers-btn-sm" onClick={addSkill} style={{ flex: 'none' }}>
                        Add
                      </button>
                    </div>
                    {skills.length > 0 && (
                      <div className="careers-skill-tags">
                        {skills.map((s) => (
                          <span key={s} className="careers-skill-x">
                            {s}
                            <button type="button" aria-label={`Remove ${s}`} onClick={() => setSkills((prev) => prev.filter((x) => x !== s))}>
                              <IconX width={12} height={12} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="careers-field">
                    <span className="careers-field-label">Resume (optional, PDF/DOC preferred)</span>
                    {resume ? (
                      <div className="careers-upload has-file" onClick={() => setResume(null)} role="button" tabIndex={0}>
                        <span className="careers-upload-file">
                          <IconDoc /> {resume.name}
                          <span className="careers-muted" style={{ fontWeight: 600, fontSize: 12 }}>(tap to remove)</span>
                        </span>
                      </div>
                    ) : (
                      <label
                        className={`careers-upload${drag ? ' is-drag' : ''}`}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setDrag(true);
                        }}
                        onDragLeave={() => setDrag(false)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setDrag(false);
                          pickFile(e.dataTransfer.files?.[0]);
                        }}
                      >
                        <IconUpload />
                        <div className="careers-upload-title">Drag &amp; drop, or tap to browse</div>
                        <div className="careers-upload-sub">PDF, DOC or DOCX · max 10 MB</div>
                        <input
                          type="file"
                          accept=".pdf,.doc,.docx,application/pdf"
                          style={{ display: 'none' }}
                          onChange={(e) => pickFile(e.target.files?.[0])}
                        />
                      </label>
                    )}
                  </div>

                  {submitError && (
                    <div className="careers-alert">
                      <IconX />
                      <span>{submitError}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="careers-wizard-foot">
          {success ? (
            <>
              <button type="button" className="careers-btn careers-btn-ghost" onClick={onClose}>
                Back to role
              </button>
              <button type="button" className="careers-btn careers-btn-primary careers-btn-block" onClick={onClose} data-action="close-success">
                Done
              </button>
            </>
          ) : (
            <>
              <button type="button" className="careers-btn careers-btn-ghost" onClick={back} disabled={step === 0}>
                Back
              </button>
              {step < 2 ? (
                <button type="button" className="careers-btn careers-btn-primary careers-btn-block" onClick={next}>
                  Continue
                </button>
              ) : (
                <button type="button" className="careers-btn careers-btn-primary careers-btn-block" onClick={submit} disabled={submitting}>
                  {submitting ? 'Submitting…' : 'Submit application'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}