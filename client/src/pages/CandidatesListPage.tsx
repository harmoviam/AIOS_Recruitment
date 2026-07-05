import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import TopBar from '../components/ui/TopBar';
import PageHeader from '../components/ui/PageHeader';
import StatusBadge from '../components/ui/StatusBadge';
import SideDrawer from '../components/ui/SideDrawer';
import type { Candidate, Job } from '../types';

export default function CandidatesListPage() {
  const { user } = useAuth();
  const isRecruiter = user?.role === 'recruiter';
  const isHm = user?.role === 'hiring_manager';
  const listTitle = isRecruiter ? 'My Candidates' : isHm ? 'Team Candidates' : 'All Candidates';
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [jobFilter, setJobFilter] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [preview, setPreview] = useState<Candidate | null>(null);
  const [bulkStage, setBulkStage] = useState('');
  const filterParam = searchParams.get('filter');

  const loadCandidates = () => {
    const params: Record<string, string> = {};
    if (search) params.search = search;
    if (jobFilter) params.job_id = jobFilter;
    if (stageFilter) params.stage = stageFilter;
    if (filterParam === 'new') params.stage = 'applied';
    if (filterParam === 'joined') params.stage = 'joined';
    api.getCandidates(params).then(setCandidates);
  };

  useEffect(() => {
    api.getJobs().then(setJobs);
  }, []);

  useEffect(() => {
    loadCandidates();
  }, [search, jobFilter, stageFilter, filterParam]);

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === candidates.length) setSelected(new Set());
    else setSelected(new Set(candidates.map((c) => c.id)));
  };

  const bulkUpdateStage = async () => {
    if (!bulkStage || selected.size === 0) return;
    await api.bulkUpdateCandidates([...selected], { stage: bulkStage });
    setSelected(new Set());
    setBulkStage('');
    loadCandidates();
  };

  const bulkExport = () => {
    const params: Record<string, string> = { ids: [...selected].join(',') };
    api.exportCandidates(params);
  };

  return (
    <>
      <TopBar
        breadcrumbs={[{ label: 'Candidates', href: '/candidates' }, { label: listTitle }]}
        searchValue={search}
        onSearch={setSearch}
        searchPlaceholder="Search name, phone, email…"
      />
      <div className="page-content">
        <PageHeader
          title={listTitle}
          description={
            isRecruiter
              ? 'Your personal candidate pipeline — follow-ups, stages, and tracking.'
              : isHm
                ? 'Candidates managed by recruiters on your team.'
                : 'Search, filter, and bulk-manage your candidate registry.'
          }
          actions={
            <>
              <Link to="/candidates/import" className="button-pill button-secondary">Import CSV</Link>
              <Link to="/candidates/new" className="button-pill button-primary">+ Add Candidate</Link>
            </>
          }
        />

        <div className="filter-bar sticky">
          <select className="input-field filter-select" value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
            <option value="">All statuses</option>
            <option value="applied">New / Applied</option>
            <option value="screening">Screening</option>
            <option value="interview">Interview</option>
            <option value="selected">Selected</option>
            <option value="joined">Joined</option>
          </select>
          <select className="input-field filter-select" value={jobFilter} onChange={(e) => setJobFilter(e.target.value)}>
            <option value="">All jobs</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>{j.title}</option>
            ))}
          </select>
        </div>

        <div className="table-wrap card flush">
          <table className="data-table">
            <thead>
              <tr>
                <th><input type="checkbox" checked={selected.size === candidates.length && candidates.length > 0} onChange={toggleAll} aria-label="Select all" /></th>
                <th>Name</th>
                <th>Phone</th>
                <th>Job</th>
                <th>Status</th>
                <th>Recruiter</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => (
                <tr
                  key={c.id}
                  className={`table-row-clickable${selected.has(c.id) ? ' selected-row' : ''}`}
                  onClick={() => setPreview(c)}
                  onKeyDown={(e) => e.key === 'Enter' && setPreview(c)}
                  tabIndex={0}
                >
                  <td onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} aria-label={`Select ${c.name}`} />
                  </td>
                  <td>
                    <Link to={`/candidates/${c.id}`} onClick={(e) => e.stopPropagation()} className="candidate-link">
                      {c.name}
                    </Link>
                  </td>
                  <td>{c.phone || '—'}</td>
                  <td>{c.job_title || '—'}</td>
                  <td><StatusBadge status={c.stage} /></td>
                  <td>{c.recruiter_name || '—'}</td>
                  <td className="text-muted">{new Date(c.updated_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {candidates.length === 0 && <p className="empty-inline">No candidates match your filters.</p>}
        </div>

        <div className="table-footer">
          <span className="text-muted">Showing {candidates.length} candidates</span>
          <button type="button" className="button-pill button-secondary btn-sm" onClick={() => api.exportCandidates()}>Export CSV</button>
        </div>

        {selected.size > 0 && (
          <div className="bulk-bar">
            <span>{selected.size} selected</span>
            <select className="input-field btn-sm" value={bulkStage} onChange={(e) => setBulkStage(e.target.value)}>
              <option value="">Change status…</option>
              <option value="screening">Screening</option>
              <option value="interview">Interview</option>
              <option value="selected">Selected</option>
              <option value="rejected">Rejected</option>
              <option value="joined">Joined</option>
            </select>
            <button type="button" className="button-pill button-secondary btn-sm" onClick={bulkUpdateStage} disabled={!bulkStage}>
              Apply
            </button>
            <button type="button" className="button-pill button-secondary btn-sm" onClick={bulkExport}>Export</button>
          </div>
        )}
      </div>

      <SideDrawer
        open={!!preview}
        onClose={() => setPreview(null)}
        title={preview?.name || ''}
        footer={
          preview && (
            <button type="button" className="button-pill button-primary" onClick={() => navigate(`/candidates/${preview.id}`)}>
              Open Full Profile →
            </button>
          )
        }
      >
        {preview && (
          <>
            <p className="text-muted">{preview.job_title} · {preview.experience_years} yrs · Score {preview.ai_score}</p>
            <StatusBadge status={preview.stage} />
            <div className="drawer-actions">
              <Link to={`/messages?candidate=${preview.id}`} className="button-pill button-secondary btn-sm">WhatsApp</Link>
              <Link to="/follow-ups" className="button-pill button-secondary btn-sm">Follow-up</Link>
              <Link to={`/interviews?candidate=${preview.id}`} className="button-pill button-primary btn-sm">Schedule</Link>
            </div>
            <p className="drawer-notes">{preview.notes || 'No notes yet.'}</p>
          </>
        )}
      </SideDrawer>
    </>
  );
}
