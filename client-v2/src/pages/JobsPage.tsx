import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useRefetchOnFocus } from '../utils/useRefetchOnFocus';
import type { Job } from '../types';

type StatusFilter = 'all' | 'active' | 'inactive';

const ACTIVE_STATUSES = ['active', 'urgent', 'open'];

function isActive(status: string) {
  return ACTIVE_STATUSES.includes((status || '').toLowerCase());
}

function statusMeta(status: string): { label: string; className: string } {
  const s = (status || '').toLowerCase();
  if (s === 'urgent') return { label: 'Urgent', className: 'job-status urgent' };
  if (isActive(status)) return { label: 'Active', className: 'job-status active' };
  return { label: 'Inactive', className: 'job-status inactive' };
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ title: '', client: '', location: '', open_positions: 1, description: '' });

  const load = useCallback(
    () =>
      api.getJobs().then((rows) =>
        setJobs(
          rows.map((j) => ({
            ...j,
            pipeline_count: Number(j.pipeline_count) || 0,
            match_percent: Number(j.match_percent) || 0,
          }))
        )
      ),
    []
  );
  useEffect(() => {
    load();
  }, [load]);
  useRefetchOnFocus(load);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.createJob(form);
    setForm({ title: '', client: '', location: '', open_positions: 1, description: '' });
    setShowForm(false);
    load();
  };

  const toggleStatus = async (job: Job) => {
    const next = isActive(job.status) ? 'inactive' : 'active';
    await api.updateJob(job.id, { status: next });
    load();
  };

  const counts = useMemo(() => {
    const active = jobs.filter((j) => isActive(j.status)).length;
    return { all: jobs.length, active, inactive: jobs.length - active };
  }, [jobs]);

  const visibleJobs = useMemo(() => {
    return jobs.filter((j) => {
      if (filter === 'active' && !isActive(j.status)) return false;
      if (filter === 'inactive' && isActive(j.status)) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          j.title.toLowerCase().includes(q) ||
          j.client.toLowerCase().includes(q) ||
          j.location.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [jobs, filter, search]);

  return (
    <>
      <div className="topbar">
        <input
          className="search-bar input-field"
          placeholder="Search job openings…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="button" className="button-pill button-primary" onClick={() => setShowForm(!showForm)}>
          + New Opening
        </button>
      </div>
      <div className="page-content">
        <h1 className="section-title">Job Openings</h1>
        <p className="section-description">Active positions with match scores and pipeline counts.</p>

        <div className="job-filter-bar">
          {(['all', 'active', 'inactive'] as StatusFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              className={`job-filter-chip${filter === f ? ' active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
              <span className="job-filter-count">{counts[f]}</span>
            </button>
          ))}
        </div>

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
          {visibleJobs.map((job) => {
            const meta = statusMeta(job.status);
            const active = isActive(job.status);
            return (
              <div key={job.id} className={`card job-card${active ? '' : ' is-inactive'}`}>
                <div className="job-card-top">
                  <div>
                    <div style={{ fontWeight: 700 }}>{job.title}</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                      {job.client} • {job.location}
                    </div>
                  </div>
                  <span className={meta.className}>
                    <span className="job-status-dot" />
                    {meta.label}
                  </span>
                </div>
                <div style={{ display: 'grid', gap: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                  <div>Assigned: <strong>{job.assigned_name || '—'}</strong></div>
                  <div>Open: <strong>{job.open_positions}</strong></div>
                  <div>Match: <strong style={{ color: 'var(--success)' }}>{job.match_percent ?? 0}%</strong></div>
                  <div>In pipeline: <strong>{job.pipeline_count ?? 0}</strong></div>
                </div>
                <div className="job-card-actions">
                  <Link to={`/pipeline?job_id=${job.id}`} className="button-pill button-secondary btn-sm">
                    View pipeline
                  </Link>
                  <button
                    type="button"
                    className={`button-pill btn-sm ${active ? 'button-secondary' : 'button-primary'}`}
                    onClick={() => toggleStatus(job)}
                  >
                    {active ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              </div>
            );
          })}
          {visibleJobs.length === 0 && <p className="empty-inline">No job openings in this view.</p>}
        </div>
      </div>
    </>
  );
}
