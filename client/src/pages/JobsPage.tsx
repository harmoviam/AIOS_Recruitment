import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { Job } from '../types';

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', client: '', location: '', open_positions: 1, description: '' });

  const load = () => api.getJobs().then(setJobs);
  useEffect(() => {
    load();
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.createJob(form);
    setForm({ title: '', client: '', location: '', open_positions: 1, description: '' });
    setShowForm(false);
    load();
  };

  return (
    <>
      <div className="topbar">
        <input className="search-bar input-field" placeholder="Search job openings…" readOnly />
        <button type="button" className="button-pill button-primary" onClick={() => setShowForm(!showForm)}>
          + New Opening
        </button>
      </div>
      <div className="page-content">
        <h1 className="section-title">Job Openings</h1>
        <p className="section-description">Active positions with match scores and pipeline counts.</p>

        {showForm && (
          <form className="card" style={{ marginBottom: '1.5rem' }} onSubmit={create}>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
              <input className="input-field" placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
              <input className="input-field" placeholder="Client" value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} required />
              <input className="input-field" placeholder="Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} required />
              <input type="number" className="input-field" placeholder="Open positions" value={form.open_positions} onChange={(e) => setForm({ ...form, open_positions: Number(e.target.value) })} />
            </div>
            <textarea className="input-field" style={{ marginTop: '1rem' }} placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <button type="submit" className="button-pill button-primary" style={{ marginTop: '1rem' }}>
              Create job
            </button>
          </form>
        )}

        <div className="grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          {jobs.map((job) => (
            <div key={job.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{job.title}</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                    {job.client} • {job.location}
                  </div>
                </div>
                <span className={`column-count ${job.status === 'urgent' ? 'urgent' : ''}`}>{job.status}</span>
              </div>
              <div style={{ display: 'grid', gap: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                <div>Assigned: <strong>{job.assigned_name || '—'}</strong></div>
                <div>Open: <strong>{job.open_positions}</strong></div>
                <div>Match: <strong style={{ color: 'var(--success)' }}>{job.match_percent ?? 0}%</strong></div>
                <div>In pipeline: <strong>{job.pipeline_count ?? 0}</strong></div>
              </div>
              <Link to={`/pipeline?job_id=${job.id}`} className="button-pill button-secondary" style={{ marginTop: '1rem', display: 'inline-block' }}>
                View pipeline
              </Link>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
