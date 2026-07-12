import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import ResumeUploadZone from '../components/ResumeUploadZone';
import TopBar from '../components/ui/TopBar';
import PageHeader from '../components/ui/PageHeader';
import type { Job, ParsedProfile, ResumeParseResponse } from '../types';

function mergeSkills(parsed: ParsedProfile): string[] {
  const all = [...(parsed.skills || []), ...(parsed.technical_skills || [])];
  return [...new Set(all.map((s) => s.trim()).filter(Boolean))];
}

function applyParsedToForm(parsed: ParsedProfile) {
  return {
    name: parsed.name || '',
    phone: parsed.phone || '',
    email: parsed.email || '',
    experience_years: parsed.total_experience_years ?? 0,
    skills: mergeSkills(parsed).join(', '),
    notes: parsed.professional_summary || '',
    salary_expectation: parsed.expected_salary || '',
    linkedin: parsed.linkedin || '',
    github: parsed.github || '',
    portfolio: parsed.portfolio || '',
    current_company: parsed.current_company || '',
    current_location: parsed.current_location || '',
    preferred_location: parsed.preferred_location || '',
    notice_period: parsed.notice_period || '',
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
  const [parsedProfile, setParsedProfile] = useState<ParsedProfile | null>(null);
  const [pendingResume, setPendingResume] = useState<Pick<
    ResumeParseResponse,
    'pending_resume_id' | 'pending_ext' | 'original_filename' | 'mime_type' | 'file_size_bytes'
  > | null>(null);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    job_id: '',
    experience_years: 0,
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
  });

  useEffect(() => {
    api.getJobs().then(setJobs);
  }, []);

  const onResumeParsed = (_file: File, result: ResumeParseResponse) => {
    setParseError('');
    setParsedProfile(result.parsed_profile);
    setAiConfidence(result.ai_confidence);
    setPendingResume({
      pending_resume_id: result.pending_resume_id,
      pending_ext: result.pending_ext,
      original_filename: result.original_filename,
      mime_type: result.mime_type,
      file_size_bytes: result.file_size_bytes,
    });
    setForm((prev) => ({ ...prev, ...applyParsedToForm(result.parsed_profile) }));
  };

  const submit = async (e: React.FormEvent, addAnother = false) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const skills = form.skills.split(',').map((s) => s.trim()).filter(Boolean);
      const created = await api.createCandidate({
        name: form.name,
        phone: form.phone,
        email: form.email || undefined,
        job_id: form.job_id ? Number(form.job_id) : undefined,
        experience_years: form.experience_years,
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
        parsed_profile: parsedProfile || undefined,
        education: parsedProfile?.education,
        experience: parsedProfile?.experience,
        projects: parsedProfile?.projects,
        certifications: parsedProfile?.certifications,
        languages: parsedProfile?.languages,
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
          experience_years: 0,
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
        });
        setParsedProfile(null);
        setPendingResume(null);
        setAiConfidence(null);
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
        />

        {aiConfidence != null && (
          <div className="ai-chip" style={{ marginBottom: '1rem' }}>
            AI confidence: {Math.round(aiConfidence * 100)}% — review fields before saving
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
              <select id="job" className="input-field" value={form.job_id} onChange={(e) => setForm({ ...form, job_id: e.target.value })} required>
                <option value="">Select job</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>{j.title} — {j.client}</option>
                ))}
              </select>
            </div>
          </div>

          <h3 className="card-heading" style={{ marginTop: '1.5rem' }}>Professional</h3>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label" htmlFor="exp">Experience (years)</label>
              <input id="exp" type="number" min={0} className="input-field" value={form.experience_years} onChange={(e) => setForm({ ...form, experience_years: Number(e.target.value) })} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="skills">Skills (comma-separated)</label>
              <input id="skills" className="input-field" value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} placeholder="Java, Spring, AWS" />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="company">Current company</label>
              <input id="company" className="input-field" value={form.current_company} onChange={(e) => setForm({ ...form, current_company: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="location">Current location</label>
              <input id="location" className="input-field" value={form.current_location} onChange={(e) => setForm({ ...form, current_location: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="preferred">Preferred location</label>
              <input id="preferred" className="input-field" value={form.preferred_location} onChange={(e) => setForm({ ...form, preferred_location: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="notice">Notice period</label>
              <input id="notice" className="input-field" value={form.notice_period} onChange={(e) => setForm({ ...form, notice_period: e.target.value })} placeholder="Immediate / 30 days" />
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
