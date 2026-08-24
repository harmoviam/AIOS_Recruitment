import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import ResumeUploadZone from '../components/ResumeUploadZone';
import CandidateLocationFields from '../components/CandidateLocationFields';
import NearbyCompaniesPanel from '../components/NearbyCompaniesPanel';
import TopBar from '../components/ui/TopBar';
import PageHeader from '../components/ui/PageHeader';
import { NOTICE_PERIOD_OPTIONS, atsScoreClass, type AtsScoreResult, type ExperienceConsistencyResult, type ExperienceGateResult, type Job, type ParsedProfile, type ResumeParseResponse } from '../types';
import { inferJobIndustry, isBpoIndustry } from '../utils/industries';

function mergeSkills(parsed: ParsedProfile): string[] {
  const all = [...(parsed.skills || []), ...(parsed.technical_skills || [])];
  return [...new Set(all.map((s) => s.trim()).filter(Boolean))];
}

function normalizedParsedNoticePeriod(value?: string | null): string {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '';
  if (normalized.includes('immediate')) return 'Immediate';
  const days = normalized.match(/\b(15|30|45|60|90)\b/)?.[1];
  return days ? `Within ${days} Days` : '';
}

function applyParsedToForm(parsed: ParsedProfile) {
  const years = parsed.total_experience_years ?? 0;
  return {
    name: parsed.name || '',
    phone: parsed.phone || '',
    email: parsed.email || '',
    min_experience: years,
    max_experience: years,
    skills: mergeSkills(parsed).join(', '),
    notes: parsed.professional_summary || '',
    salary_expectation: parsed.expected_salary || '',
    linkedin: parsed.linkedin || '',
    github: parsed.github || '',
    portfolio: parsed.portfolio || '',
    current_company: parsed.current_company || '',
    current_location: parsed.current_location || '',
    preferred_location: parsed.preferred_location || '',
    notice_period: normalizedParsedNoticePeriod(parsed.notice_period),
    current_salary: parsed.current_salary || '',
    professional_summary: parsed.professional_summary || '',
  };
}

export default function AddCandidatePage() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [parseError, setParseError] = useState('');
  const [aiConfidence, setAiConfidence] = useState<number | null>(null);
  const [ats, setAts] = useState<AtsScoreResult | null>(null);
  const [experienceGate, setExperienceGate] = useState<ExperienceGateResult | null>(null);
  const [experienceConsistency, setExperienceConsistency] =
    useState<ExperienceConsistencyResult | null>(null);
  const [parsedProfile, setParsedProfile] = useState<ParsedProfile | null>(null);
  const [pendingResume, setPendingResume] = useState<Pick<
    ResumeParseResponse,
    'pending_resume_id' | 'pending_ext' | 'original_filename' | 'mime_type' | 'file_size_bytes'
  > | null>(null);
  const [extraJobIds, setExtraJobIds] = useState<number[]>([]);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    job_id: '',
    min_experience: 0,
    max_experience: 0,
    skills: '',
    notes: '',
    salary_expectation: '',
    linkedin: '',
    github: '',
    portfolio: '',
    current_company: '',
    current_location: '',
    preferred_location: '',
    notice_period: '',
    current_salary: '',
    professional_summary: '',
    latitude: null as number | null,
    longitude: null as number | null,
    relocation_allowed: false,
    age: '',
    gender: '',
    highest_qualification: '',
    specialization: '',
    preferred_job_type: '',
    preferred_shift: '',
    languages: '',
  });

  useEffect(() => {
    api.getJobs().then(setJobs);
  }, []);

  const selectedJob = useMemo(
    () => jobs.find((j) => String(j.id) === form.job_id) || null,
    [jobs, form.job_id]
  );

  const selectedIndustry = selectedJob ? inferJobIndustry(selectedJob) : null;

  /** All other openings; same-industry (incl. BPO) sorted first so BPO multi-submit is obvious. */
  const alsoSubmitJobs = useMemo(() => {
    const others = jobs.filter((j) => String(j.id) !== form.job_id);
    if (!form.job_id || others.length === 0) return [];
    if (!selectedIndustry) return others;
    return [...others].sort((a, b) => {
      const aMatch = inferJobIndustry(a) === selectedIndustry ? 0 : 1;
      const bMatch = inferJobIndustry(b) === selectedIndustry ? 0 : 1;
      return aMatch - bMatch;
    });
  }, [jobs, form.job_id, selectedIndustry]);

  const onResumeParsed = (_file: File, result: ResumeParseResponse) => {
    setParseError('');
    setParsedProfile(result.parsed_profile);
    setAiConfidence(result.ai_confidence);
    setAts(result.ats ?? null);
    setExperienceGate(result.experience_gate ?? null);
    setExperienceConsistency(result.experience_consistency ?? null);
    setPendingResume({
      pending_resume_id: result.pending_resume_id,
      pending_ext: result.pending_ext,
      original_filename: result.original_filename,
      mime_type: result.mime_type,
      file_size_bytes: result.file_size_bytes,
    });
    setForm((prev) => ({ ...prev, ...applyParsedToForm(result.parsed_profile) }));
  };

  const experienceYears = () => {
    const min = Number(form.min_experience) || 0;
    const max = Number(form.max_experience) || 0;
    return Math.max(min, max);
  };

  const submit = async (e: React.FormEvent, addAnother = false) => {
    e.preventDefault();
    setError('');
    const min = Number(form.min_experience) || 0;
    const max = Number(form.max_experience) || 0;
    if (max > 0 && min > max) {
      setError('Min experience cannot be greater than max experience');
      return;
    }
    setLoading(true);
    try {
      const skills = form.skills.split(',').map((s) => s.trim()).filter(Boolean);
      const created = await api.createCandidate({
        name: form.name,
        phone: form.phone,
        email: form.email || undefined,
        job_id: form.job_id ? Number(form.job_id) : undefined,
        job_ids: extraJobIds.length > 0 ? extraJobIds : undefined,
        experience_years: experienceYears(),
        skills,
        notes: form.notes || undefined,
        salary_expectation: form.salary_expectation || undefined,
        stage: 'applied',
        linkedin: form.linkedin || undefined,
        github: form.github || undefined,
        portfolio: form.portfolio || undefined,
        current_company: form.current_company || undefined,
        current_location: form.current_location || undefined,
        preferred_location: form.preferred_location || undefined,
        notice_period: form.notice_period || undefined,
        current_salary: form.current_salary || undefined,
        professional_summary: form.professional_summary || undefined,
        latitude: form.latitude ?? undefined,
        longitude: form.longitude ?? undefined,
        relocation_allowed: form.relocation_allowed,
        age: form.age ? Number(form.age) : undefined,
        gender: form.gender || undefined,
        highest_qualification: form.highest_qualification || undefined,
        specialization: form.specialization || undefined,
        preferred_job_type: form.preferred_job_type || undefined,
        preferred_shift: form.preferred_shift || undefined,
        languages:
          form.languages.trim().length > 0
            ? form.languages.split(',').map((s) => s.trim()).filter(Boolean)
            : parsedProfile?.languages,
        parsed_profile: parsedProfile || undefined,
        education: parsedProfile?.education,
        experience: parsedProfile?.experience,
        projects: parsedProfile?.projects,
        certifications: parsedProfile?.certifications,
        technical_skills: parsedProfile?.technical_skills,
        soft_skills: parsedProfile?.soft_skills,
        ...(pendingResume
          ? {
              pending_resume_id: pendingResume.pending_resume_id,
              pending_ext: pendingResume.pending_ext,
              original_filename: pendingResume.original_filename,
              mime_type: pendingResume.mime_type,
              file_size_bytes: pendingResume.file_size_bytes,
              ai_confidence: aiConfidence ?? undefined,
            }
          : {}),
      });
      if (addAnother) {
        setForm({
          name: '',
          phone: '',
          email: '',
          job_id: form.job_id,
          min_experience: 0,
          max_experience: 0,
          skills: '',
          notes: '',
          salary_expectation: '',
          linkedin: '',
          github: '',
          portfolio: '',
          current_company: '',
          current_location: '',
          preferred_location: '',
          notice_period: '',
          current_salary: '',
          professional_summary: '',
          latitude: null,
          longitude: null,
          relocation_allowed: false,
          age: '',
          gender: '',
          highest_qualification: '',
          specialization: '',
          preferred_job_type: '',
          preferred_shift: '',
          languages: '',
        });
        setExtraJobIds([]);
        setParsedProfile(null);
        setPendingResume(null);
        setAiConfidence(null);
        setAts(null);
        setExperienceGate(null);
        setExperienceConsistency(null);
      } else {
        navigate(`/candidates/${created.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create candidate');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <TopBar breadcrumbs={[{ label: 'Candidates', href: '/candidates' }, { label: 'Add Candidate' }]} />
      <div className="page-content">
        <PageHeader
          title="Add Candidate"
          description="Upload a resume for AI parsing or enter details manually."
        />

        {error && <div className="form-error">{error}</div>}
        {parseError && <div className="form-error">{parseError}</div>}

        <ResumeUploadZone
          onParsed={onResumeParsed}
          onError={setParseError}
          disabled={loading}
          jobId={selectedJob?.id ?? null}
        />

        {aiConfidence != null && (
          <div className="ai-chip" style={{ marginBottom: '1rem' }}>
            AI confidence: {Math.round(aiConfidence * 100)}% — review fields before saving
          </div>
        )}

        {experienceGate && !experienceGate.passed && (
          <div className="card mass-screen-error" role="alert" style={{ marginBottom: '1rem' }}>
            <strong>Experience requirement not met.</strong>{' '}
            {experienceGate.reason ||
              `Candidate has ${experienceGate.candidate_years} years; job requires ${experienceGate.required_years}+.`}{' '}
            ATS scoring and JD comparison were skipped. You can still save the candidate or pick a different job and re-upload.
          </div>
        )}

        {experienceConsistency && (
          <div className="card" style={{ marginBottom: '1rem' }}>
            <div className="card-title">Experience from employment history</div>
            <p className="text-muted" style={{ marginBottom: '0.5rem' }}>
              Calculated from company date ranges
              {experienceConsistency.employment_years != null
                ? `: ${experienceConsistency.employment_years} years`
                : ' (no dated roles found)'}
              {experienceConsistency.claimed_years != null
                ? ` · Summary claims ${experienceConsistency.claimed_years} years`
                : ''}
            </p>
            {experienceConsistency.roles.length > 0 && (
              <ul className="ats-breakdown">
                {experienceConsistency.roles.map((r, i) => (
                  <li key={`${r.company}-${r.title}-${i}`}>
                    <span className="ats-breakdown-label">
                      {r.title}
                      {r.company ? ` · ${r.company}` : ''}
                    </span>
                    <span className="ats-breakdown-score">
                      {r.years != null ? `${r.years} yrs` : '—'}
                    </span>
                    <span className="ats-breakdown-detail text-muted">
                      {[r.start_date, r.end_date].filter(Boolean).join(' – ') || 'Dates missing'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {experienceConsistency.mismatch && (
              <p className="form-error" role="alert" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
                {experienceConsistency.reason}
              </p>
            )}
          </div>
        )}

        {ats && (
          <div className="card" style={{ marginBottom: '1rem' }}>
            <div className="screening-section-head">
              <div>
                <div className="card-title">Resume ATS score</div>
                <p className="text-muted">
                  Scored on parseability, completeness
                  {ats.scored_against_job ? ', and match against the selected job.' : '. Pick a job below and re-upload to include JD keyword match.'}
                </p>
              </div>
              <span className={atsScoreClass(ats.score)}>
                {ats.score}/100 · {ats.grade}
              </span>
            </div>
            <ul className="ats-breakdown">
              {ats.categories.map((c) => (
                <li key={c.key}>
                  <span className="ats-breakdown-label">{c.label}</span>
                  <span className="ats-breakdown-score">{c.score}/{c.max}</span>
                  <span className="ats-breakdown-detail text-muted">{c.detail}</span>
                </li>
              ))}
            </ul>
            {ats.missing.length > 0 && (
              <p className="text-muted" style={{ marginTop: '0.5rem' }}>
                Missing from the resume: {ats.missing.join(', ')}.
              </p>
            )}
          </div>
        )}

        <form className="card form-card" onSubmit={(e) => submit(e, false)}>
          <h3 className="card-heading">Required</h3>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label" htmlFor="name">Full name *</label>
              <input id="name" className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="phone">Phone *</label>
              <input id="phone" className="input-field" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required placeholder="+91" />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="email">Email</label>
              <input id="email" type="email" className="input-field" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="job">Job *</label>
              <select
                id="job"
                className="input-field"
                value={form.job_id}
                onChange={(e) => {
                  setForm({ ...form, job_id: e.target.value });
                  setExtraJobIds([]);
                }}
                required
              >
                <option value="">Select job</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title} — {j.client}
                    {inferJobIndustry(j) ? ` (${inferJobIndustry(j)})` : ''}
                  </option>
                ))}
              </select>
            </div>
            {form.job_id && alsoSubmitJobs.length > 0 && (
              <div className="form-group form-span-2">
                <label className="form-label">
                  Also submit to
                  {isBpoIndustry(selectedIndustry) ? ' (includes other BPO roles)' : ''}
                </label>
                <p className="text-muted" style={{ fontSize: '0.8rem', margin: '0 0 0.35rem' }}>
                  {isBpoIndustry(selectedIndustry)
                    ? 'BPO openings are listed first — tick any other roles to create applications together.'
                    : 'Optionally add applications to other openings. Same-category jobs (including BPO) are listed first.'}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: '160px', overflowY: 'auto' }}>
                  {alsoSubmitJobs.map((j) => (
                    <label key={j.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
                      <input
                        type="checkbox"
                        checked={extraJobIds.includes(j.id)}
                        onChange={(e) =>
                          setExtraJobIds((prev) =>
                            e.target.checked ? [...prev, j.id] : prev.filter((id) => id !== j.id)
                          )
                        }
                      />
                      {j.title} — {j.client}
                      {inferJobIndustry(j) ? (
                        <span className="text-muted">({inferJobIndustry(j)})</span>
                      ) : null}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          <h3 className="card-heading" style={{ marginTop: '1.5rem' }}>Professional</h3>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label" htmlFor="min-exp">Min experience (years)</label>
              <input
                id="min-exp"
                type="number"
                min={0}
                step={0.5}
                className="input-field"
                value={form.min_experience}
                onChange={(e) => setForm({ ...form, min_experience: Number(e.target.value) })}
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="max-exp">Max experience (years)</label>
              <input
                id="max-exp"
                type="number"
                min={0}
                step={0.5}
                className="input-field"
                value={form.max_experience}
                onChange={(e) => setForm({ ...form, max_experience: Number(e.target.value) })}
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="skills">Skills (comma-separated)</label>
              <input id="skills" className="input-field" value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} placeholder="Java, Spring, AWS" />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="company">Current company</label>
              <input id="company" className="input-field" value={form.current_company} onChange={(e) => setForm({ ...form, current_company: e.target.value })} />
            </div>
            <CandidateLocationFields
              value={{
                current_location: form.current_location,
                latitude: form.latitude,
                longitude: form.longitude,
                relocation_allowed: form.relocation_allowed,
              }}
              onChange={(loc) =>
                setForm({
                  ...form,
                  current_location: loc.current_location,
                  latitude: loc.latitude,
                  longitude: loc.longitude,
                  relocation_allowed: loc.relocation_allowed,
                })
              }
              disabled={loading}
            />
            <div className="form-span-2">
              <NearbyCompaniesPanel latitude={form.latitude} longitude={form.longitude} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="preferred">Preferred location</label>
              <input id="preferred" className="input-field" value={form.preferred_location} onChange={(e) => setForm({ ...form, preferred_location: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="age">Age</label>
              <input id="age" type="number" min={16} className="input-field" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="gender">Gender</label>
              <input id="gender" className="input-field" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="qualification">Highest qualification</label>
              <input id="qualification" className="input-field" value={form.highest_qualification} onChange={(e) => setForm({ ...form, highest_qualification: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="specialization">Specialization</label>
              <input id="specialization" className="input-field" value={form.specialization} onChange={(e) => setForm({ ...form, specialization: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="languages">Languages known (comma-separated)</label>
              <input id="languages" className="input-field" value={form.languages} onChange={(e) => setForm({ ...form, languages: e.target.value })} placeholder="English, Hindi" />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="notice">Notice period</label>
              <select id="notice" className="input-field" value={form.notice_period} onChange={(e) => setForm({ ...form, notice_period: e.target.value })}>
                <option value="">Select notice period</option>
                {NOTICE_PERIOD_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="salary">Expected salary</label>
              <input id="salary" className="input-field" value={form.salary_expectation} onChange={(e) => setForm({ ...form, salary_expectation: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="current-salary">Current salary</label>
              <input id="current-salary" className="input-field" value={form.current_salary} onChange={(e) => setForm({ ...form, current_salary: e.target.value })} />
            </div>
          </div>

          <h3 className="card-heading" style={{ marginTop: '1.5rem' }}>Links</h3>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label" htmlFor="linkedin">LinkedIn</label>
              <input id="linkedin" className="input-field" value={form.linkedin} onChange={(e) => setForm({ ...form, linkedin: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="github">GitHub</label>
              <input id="github" className="input-field" value={form.github} onChange={(e) => setForm({ ...form, github: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="portfolio">Portfolio</label>
              <input id="portfolio" className="input-field" value={form.portfolio} onChange={(e) => setForm({ ...form, portfolio: e.target.value })} />
            </div>
          </div>

          <div className="form-group" style={{ marginTop: '1rem' }}>
            <label className="form-label" htmlFor="summary">Professional summary</label>
            <textarea id="summary" className="input-field" rows={3} value={form.professional_summary} onChange={(e) => setForm({ ...form, professional_summary: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="notes">Notes</label>
            <textarea id="notes" className="input-field" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>

          <div className="form-actions">
            <Link to="/candidates" className="button-pill button-secondary">Cancel</Link>
            <button type="button" className="button-pill button-secondary" disabled={loading} onClick={(e) => submit(e, true)}>Save & Add Another</button>
            <button type="submit" className="button-pill button-primary" disabled={loading}>{loading ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </div>
    </>
  );
}
