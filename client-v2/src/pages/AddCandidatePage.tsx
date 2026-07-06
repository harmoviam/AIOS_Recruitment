import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import TopBar from '../components/ui/TopBar';
import PageHeader from '../components/ui/PageHeader';
import type { Job } from '../types';
import { useEffect } from 'react';

export default function AddCandidatePage() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    job_id: '',
    experience_years: 0,
    skills: '',
    notes: '',
  });

  useEffect(() => {
    api.getJobs().then(setJobs);
  }, []);

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
        stage: 'applied',
      });
      if (addAnother) {
        setForm({ name: '', phone: '', email: '', job_id: form.job_id, experience_years: 0, skills: '', notes: '' });
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
        <PageHeader title="Add Candidate" description="Create a new candidate record." />

        {error && <div className="form-error">{error}</div>}

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
