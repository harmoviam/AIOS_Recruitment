import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import JobLocationPicker, { type JobLocationValue } from '../components/JobLocationPicker';
import { useAuth } from '../context/AuthContext';
import { useRefetchOnFocus } from '../utils/useRefetchOnFocus';
import type { Job } from '../types';

type StatusFilter = 'all' | 'active' | 'inactive' | '60days' | '90days';

const FILTER_LABELS: Record<StatusFilter, string> = {
  all: 'All',
  active: 'Active',
  inactive: 'Inactive',
  '60days': '60 Days',
  '90days': '90 Days',
};

const ACTIVE_STATUSES = ['active', 'urgent', 'open'];

function isActive(status: string) {
  return ACTIVE_STATUSES.includes((status || '').toLowerCase());
}

// Jobs without an explicit tenure default to 90 days (matches the card display).
function tenureDays(job: Job) {
  return job.tenure_days ?? 90;
}

function statusMeta(status: string): { label: string; className: string } {
  const s = (status || '').toLowerCase();
  if (s === 'urgent') return { label: 'Urgent', className: 'job-status urgent' };
  if (isActive(status)) return { label: 'Active', className: 'job-status active' };
  return { label: 'Inactive', className: 'job-status inactive' };
}

const EMPTY_LOCATION: Partial<JobLocationValue> = {
  address: '',
  latitude: undefined,
  longitude: undefined,
  city: '',
  state: '',
  country: '',
  pincode: '',
  locationLabel: '',
};

const EMPTY_FORM = {
  title: '',
  client: '',
  location: '',
  open_positions: 1,
  description: '',
  tenure_days: '',
  required_qualification: '',
  required_languages: '',
  required_skills: '',
  salary: '',
  shift: '',
  job_type: '',
  min_experience: '',
  max_experience: '',
  min_age: '',
  max_age: '',
  gender_preference: '',
};

function jobToLocation(job: Job): Partial<JobLocationValue> {
  return {
    address: job.address || '',
    latitude: job.latitude ?? undefined,
    longitude: job.longitude ?? undefined,
    city: job.city || '',
    state: job.state || '',
    country: job.country || '',
    pincode: job.pincode || '',
    locationLabel: job.location || '',
  };
}

export default function JobsPage() {
  const { user } = useAuth();
  // Only org admins and hiring managers can add or edit jobs.
  const canManageJobs = user?.role === 'admin' || user?.role === 'hiring_manager';
  const [jobs, setJobs] = useState<Job[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [jobLocation, setJobLocation] = useState<Partial<JobLocationValue>>(EMPTY_LOCATION);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [viewingJd, setViewingJd] = useState<Job | null>(null);
  const [copiedJobId, setCopiedJobId] = useState<number | null>(null);

  const copyApplyLink = (job: Job) => {
    const slug = localStorage.getItem('aios_tenant_slug') || '';
    const url = `${window.location.origin}/careers/${slug}/jobs/${job.id}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedJobId(job.id);
      setTimeout(() => setCopiedJobId((prev) => (prev === job.id ? null : prev)), 2000);
    });
  };
  const [jdScreeningQuestions, setJdScreeningQuestions] = useState<import('../types').JobScreeningQuestions | null>(null);
  const [loadingJdQuestions, setLoadingJdQuestions] = useState(false);
  const [regeneratingQuestions, setRegeneratingQuestions] = useState(false);

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

  const openCreateForm = () => {
    if (showForm && !editingJob) {
      setShowForm(false);
      return;
    }
    setEditingJob(null);
    setForm(EMPTY_FORM);
    setJobLocation(EMPTY_LOCATION);
    setSaveError('');
    setShowForm(true);
  };

  const openEditForm = (job: Job) => {
    setEditingJob(job);
    setForm({
      title: job.title,
      client: job.client,
      location: job.location,
      open_positions: job.open_positions ?? 1,
      description: job.description || '',
      tenure_days: job.tenure_days != null ? String(job.tenure_days) : '',
      required_qualification: job.required_qualification || '',
      required_languages: (job.required_languages || []).join(', '),
      required_skills: (job.required_skills || []).join(', '),
      salary: job.salary || '',
      shift: job.shift || '',
      job_type: job.job_type || '',
      min_experience: job.min_experience != null ? String(job.min_experience) : '',
      max_experience: job.max_experience != null ? String(job.max_experience) : '',
      min_age: job.min_age != null ? String(job.min_age) : '',
      max_age: job.max_age != null ? String(job.max_age) : '',
      gender_preference: job.gender_preference || '',
    });
    setJobLocation(jobToLocation(job));
    setSaveError('');
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingJob(null);
    setForm(EMPTY_FORM);
    setJobLocation(EMPTY_LOCATION);
    setSaveError('');
    setSaving(false);
  };

  const splitList = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

  const hasMapPin =
    jobLocation.latitude != null &&
    jobLocation.longitude != null &&
    !(jobLocation.latitude === 0 && jobLocation.longitude === 0) &&
    Boolean(jobLocation.address?.trim());

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError('');
    if (!editingJob && !hasMapPin) {
      setSaveError('Select a job address from Google Maps suggestions — latitude and longitude are required.');
      return;
    }
    const locationLabel =
      jobLocation.locationLabel ||
      form.location ||
      jobLocation.city ||
      jobLocation.address ||
      '';
    if (!locationLabel.trim()) {
      setSaveError('Location label is required.');
      return;
    }
    const payload = {
      ...form,
      tenure_days: form.tenure_days ? Number(form.tenure_days) : null,
      location: locationLabel.trim(),
      latitude: jobLocation.latitude,
      longitude: jobLocation.longitude,
      address: jobLocation.address || locationLabel.trim(),
      city: jobLocation.city || null,
      state: jobLocation.state || null,
      country: jobLocation.country || null,
      pincode: jobLocation.pincode || null,
      required_languages: splitList(form.required_languages),
      required_skills: splitList(form.required_skills),
      min_experience: form.min_experience ? Number(form.min_experience) : null,
      max_experience: form.max_experience ? Number(form.max_experience) : null,
      min_age: form.min_age ? Number(form.min_age) : null,
      max_age: form.max_age ? Number(form.max_age) : null,
    };
    setSaving(true);
    try {
      if (editingJob) {
        await api.updateJob(editingJob.id, payload);
      } else {
        await api.createJob(payload);
      }
      closeForm();
      load();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save job');
    } finally {
      setSaving(false);
    }
  };

  const generateDescription = async () => {
    if (!form.title.trim()) {
      alert('Enter a title first — the AI drafts the description from it.');
      return;
    }
    setGenerating(true);
    try {
      const r = await api.generateJobDescription({
        title: form.title,
        client: form.client,
        location: form.location,
        open_positions: form.open_positions,
      });
      setForm((f) => ({ ...f, description: r.description }));
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setGenerating(false);
    }
  };

  const toggleStatus = async (job: Job) => {
    const next = isActive(job.status) ? 'inactive' : 'active';
    await api.updateJob(job.id, { status: next });
    load();
  };

  const openViewJd = async (job: Job) => {
    setViewingJd(job);
    setJdScreeningQuestions(job.screening_questions ?? null);
    setLoadingJdQuestions(true);
    try {
      const r = await api.getJobScreeningQuestions(job.id);
      setJdScreeningQuestions(r.questions);
    } catch {
      setJdScreeningQuestions(null);
    } finally {
      setLoadingJdQuestions(false);
    }
  };

  const regenerateScreeningQuestions = async () => {
    if (!viewingJd) return;
    setRegeneratingQuestions(true);
    try {
      const r = await api.generateJobScreeningQuestions(viewingJd.id);
      setJdScreeningQuestions(r.questions);
      load();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setRegeneratingQuestions(false);
    }
  };

  const counts = useMemo(() => {
    const active = jobs.filter((j) => isActive(j.status)).length;
    return {
      all: jobs.length,
      active,
      inactive: jobs.length - active,
      '60days': jobs.filter((j) => tenureDays(j) === 60).length,
      '90days': jobs.filter((j) => tenureDays(j) === 90).length,
    };
  }, [jobs]);

  const visibleJobs = useMemo(() => {
    return jobs.filter((j) => {
      if (filter === 'active' && !isActive(j.status)) return false;
      if (filter === 'inactive' && isActive(j.status)) return false;
      if (filter === '60days' && tenureDays(j) !== 60) return false;
      if (filter === '90days' && tenureDays(j) !== 90) return false;
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
        {canManageJobs && (
          <button type="button" className="button-pill button-primary" onClick={openCreateForm}>
            + New Opening
          </button>
        )}
      </div>
      <div className="page-content">
        <h1 className="section-title">Job Openings</h1>
        <p className="section-description">Active positions with match scores and pipeline counts.</p>

        <div className="job-filter-bar">
          {(['all', 'active', 'inactive', '60days', '90days'] as StatusFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              className={`job-filter-chip${filter === f ? ' active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {FILTER_LABELS[f]}
              <span className="job-filter-count">{counts[f]}</span>
            </button>
          ))}
        </div>

        {canManageJobs && showForm && (
          <form className="card" style={{ marginBottom: '1.5rem' }} onSubmit={save}>
            {editingJob && (
              <h3 className="card-heading" style={{ marginBottom: '1rem' }}>
                Editing: {editingJob.title}
              </h3>
            )}
            <div className="grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
              <input className="input-field" placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
              <input className="input-field" placeholder="Client" value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} required />
              <input className="input-field" placeholder="Display location label" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} required />
              <input type="number" className="input-field" placeholder="Open positions" value={form.open_positions} onChange={(e) => setForm({ ...form, open_positions: Number(e.target.value) })} />
              <input className="input-field" placeholder="Salary (e.g. 4.2 LPA)" value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} />
              <input className="input-field" placeholder="Job type (On-site / Remote / Hybrid)" value={form.job_type} onChange={(e) => setForm({ ...form, job_type: e.target.value })} />
              <input className="input-field" placeholder="Shift (Day / Night)" value={form.shift} onChange={(e) => setForm({ ...form, shift: e.target.value })} />
              <input className="input-field" placeholder="Required qualification" value={form.required_qualification} onChange={(e) => setForm({ ...form, required_qualification: e.target.value })} />
              <input className="input-field" placeholder="Required languages (comma-separated)" value={form.required_languages} onChange={(e) => setForm({ ...form, required_languages: e.target.value })} />
              <input className="input-field" placeholder="Required skills (comma-separated)" value={form.required_skills} onChange={(e) => setForm({ ...form, required_skills: e.target.value })} />
              <input type="number" className="input-field" placeholder="Min experience (years)" value={form.min_experience} onChange={(e) => setForm({ ...form, min_experience: e.target.value })} />
              <input type="number" className="input-field" placeholder="Max experience (years)" value={form.max_experience} onChange={(e) => setForm({ ...form, max_experience: e.target.value })} />
              <input type="number" className="input-field" placeholder="Min age" value={form.min_age} onChange={(e) => setForm({ ...form, min_age: e.target.value })} />
              <input type="number" className="input-field" placeholder="Max age" value={form.max_age} onChange={(e) => setForm({ ...form, max_age: e.target.value })} />
              <select className="input-field" value={form.tenure_days} onChange={(e) => setForm({ ...form, tenure_days: e.target.value })}>
                <option value="">Tenure (default 90 days)</option>
                <option value="30">30 days</option>
                <option value="45">45 days</option>
                <option value="60">60 days</option>
                <option value="90">90 days (3 months)</option>
                <option value="120">120 days (4 months)</option>
                <option value="150">150 days (5 months)</option>
                <option value="180">180 days (6 months)</option>
              </select>
            </div>
            <JobLocationPicker
              value={jobLocation}
              onChange={(loc) => {
                setJobLocation(loc);
                setSaveError('');
                setForm((f) => ({
                  ...f,
                  location: loc.locationLabel || loc.city || loc.address || f.location,
                }));
              }}
            />
            <textarea
              className="input-field"
              style={{ marginTop: '1rem', minHeight: '320px', resize: 'vertical', lineHeight: 1.55, fontFamily: 'inherit' }}
              placeholder="Description — type it in or draft it with AI below"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
            {saveError && (
              <p className="form-error" style={{ marginTop: '0.75rem' }} role="alert">
                {saveError}
              </p>
            )}
            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
              <button type="submit" className="button-pill button-primary" disabled={saving}>
                {saving ? 'Saving…' : editingJob ? 'Save changes' : 'Create job'}
              </button>
              <button
                type="button"
                className="button-pill button-secondary"
                disabled={generating}
                title="Draft the description with AI from the fields above"
                onClick={generateDescription}
              >
                {generating ? '… Drafting' : '✨ Draft with AI'}
              </button>
              <button type="button" className="button-pill button-secondary" onClick={closeForm}>
                Cancel
              </button>
            </div>
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
                  <div>Tenure: <strong>{job.tenure_days ? `${job.tenure_days} days` : '90 days (default)'}</strong></div>
                  <div>Match: <strong style={{ color: 'var(--success)' }}>{job.match_percent ?? 0}%</strong></div>
                  <div>In pipeline: <strong>{job.pipeline_count ?? 0}</strong></div>
                </div>
                <div className="job-card-actions">
                  <button
                    type="button"
                    className="button-pill button-secondary btn-sm"
                    title={job.description ? 'View the full job description' : 'No description added for this job yet'}
                    onClick={() => openViewJd(job)}
                  >
                    View JD
                  </button>
                  <Link to={`/pipeline?job_id=${job.id}`} className="button-pill button-secondary btn-sm">
                    View pipeline
                  </Link>
                  <button
                    type="button"
                    className="button-pill button-secondary btn-sm"
                    title="Copy the public apply link — share it on WhatsApp, LinkedIn, or job boards"
                    onClick={() => copyApplyLink(job)}
                  >
                    {copiedJobId === job.id ? 'Link copied ✓' : 'Copy apply link'}
                  </button>
                  {canManageJobs && (
                    <>
                      <button
                        type="button"
                        className="button-pill button-secondary btn-sm"
                        onClick={() => openEditForm(job)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className={`button-pill btn-sm ${active ? 'button-secondary' : 'button-primary'}`}
                        onClick={() => toggleStatus(job)}
                      >
                        {active ? 'Deactivate' : 'Activate'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
          {visibleJobs.length === 0 && <p className="empty-inline">No job openings in this view.</p>}
        </div>
      </div>

      {viewingJd && (
        <div className="modal-overlay" onClick={() => setViewingJd(null)}>
          <div className="modal-card jd-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="card-heading">{viewingJd.title}</h3>
            <p className="text-muted" style={{ marginBottom: '1rem' }}>
              {viewingJd.client} • {viewingJd.location} • {viewingJd.open_positions} open position{viewingJd.open_positions === 1 ? '' : 's'}
            </p>
            <div className="jd-modal-body">
              {viewingJd.description?.trim() || 'No description has been added for this job yet. Edit the job or draft one with AI.'}
            </div>
            <div style={{ marginTop: '1.25rem' }}>
              <h4 className="card-heading" style={{ marginBottom: '0.5rem' }}>Screening Questions</h4>
              {loadingJdQuestions ? (
                <p className="text-muted">Loading questions from JD…</p>
              ) : jdScreeningQuestions ? (
                <>
                  <p className="text-muted" style={{ marginBottom: '0.75rem', fontSize: '0.9rem' }}>
                    Generated from JD requirements ({jdScreeningQuestions.source || 'default'}).
                    {jdScreeningQuestions.prescreen.length} pre-screen · {jdScreeningQuestions.interview.length} interview questions.
                  </p>
                  <div className="jd-screening-preview">
                    <strong>Pre-screen</strong>
                    <ul>
                      {jdScreeningQuestions.prescreen.map((q) => (
                        <li key={q.id}>
                          {q.label}
                          {q.requirement ? <span className="text-muted"> — {q.requirement}</span> : null}
                        </li>
                      ))}
                    </ul>
                    <strong>Interview</strong>
                    <ul>
                      {jdScreeningQuestions.interview.map((q) => (
                        <li key={q.id}>
                          {q.label}
                          {q.requirement ? <span className="text-muted"> — {q.requirement}</span> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              ) : (
                <p className="text-muted">No screening questions yet. Add a JD description and save the job.</p>
              )}
            </div>
            <div className="modal-actions">
              {viewingJd.description?.trim() && (
                <button
                  type="button"
                  className="button-pill button-secondary"
                  onClick={() => navigator.clipboard.writeText(viewingJd.description || '')}
                >
                  Copy JD
                </button>
              )}
              {canManageJobs && viewingJd.description?.trim() && (
                <button
                  type="button"
                  className="button-pill button-secondary"
                  disabled={regeneratingQuestions}
                  onClick={regenerateScreeningQuestions}
                >
                  {regeneratingQuestions ? 'Regenerating…' : 'Regenerate questions'}
                </button>
              )}
              <button type="button" className="button-pill button-primary" onClick={() => setViewingJd(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
