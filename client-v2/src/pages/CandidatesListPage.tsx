import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import TopBar from '../components/ui/TopBar';
import PageHeader from '../components/ui/PageHeader';
import StatusBadge from '../components/ui/StatusBadge';
import SideDrawer from '../components/ui/SideDrawer';
import Tabs from '../components/ui/Tabs';
import { riskBadgeClass } from '../types';
import type { Candidate, HiringManager, Job, RecruiterStat } from '../types';

type HmScope = 'my' | 'team';

export default function CandidatesListPage() {
  const { user } = useAuth();
  const isRecruiter = user?.role === 'recruiter';
  const isHm = user?.role === 'hiring_manager';
  const isAdmin = user?.role === 'admin';
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [teamRecruiters, setTeamRecruiters] = useState<RecruiterStat[]>([]);
  const [hiringManagers, setHiringManagers] = useState<HiringManager[]>([]);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [jobFilter, setJobFilter] = useState('');
  const [recruiterFilter, setRecruiterFilter] = useState('');
  const [hmScope, setHmScope] = useState<HmScope>('team');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [preview, setPreview] = useState<Candidate | null>(null);
  const [bulkStage, setBulkStage] = useState('');
  const filterParam = searchParams.get('filter');
  const scopeParam = searchParams.get('scope');
  const hmFilterParam = searchParams.get('hm');
  const hmFilter = isAdmin && hmFilterParam ? hmFilterParam : '';

  // Sidebar links navigate to /candidates?scope=my|team — keep the HM tabs in sync.
  useEffect(() => {
    if (!isHm) return;
    if (scopeParam === 'my' || scopeParam === 'team') {
      setHmScope(scopeParam);
      if (scopeParam === 'my') setRecruiterFilter('');
    }
  }, [scopeParam, isHm]);

  const selectedHm = isAdmin && hmFilter
    ? hiringManagers.find((h) => String(h.id) === hmFilter)
    : null;

  const baseTitle = isRecruiter
    ? 'My Candidates'
    : isHm
      ? hmScope === 'my'
        ? 'My Candidates'
        : 'My Team Candidates'
      : selectedHm
        ? `${selectedHm.name}'s Candidates`
        : 'All Candidates';
  const listTitle = filterParam === 'hot' ? `🔥 Hot Candidates` : baseTitle;

  const loadCandidates = () => {
    const params: Record<string, string> = {};
    if (search) params.search = search;
    if (jobFilter) params.job_id = jobFilter;
    if (stageFilter) params.status = stageFilter;
    if (filterParam === 'new') params.stage = 'applied';
    if (filterParam === 'joined') params.stage = 'joined';
    if (filterParam === 'selected') params.stage = 'selected';
    if (filterParam === 'rejected') params.stage = 'rejected';
    if (filterParam === 'email_sent') params.stage = 'email_sent';
    if (filterParam === 'ho_pending') params.stage = 'ho_pending';
    if (filterParam === 'hot') params.hot = 'true';
    if (isHm) {
      params.scope = hmScope;
      if (hmScope === 'team' && recruiterFilter) params.recruiter_id = recruiterFilter;
    }
    if (isAdmin && hmFilter) {
      params.hm_id = hmFilter;
      if (recruiterFilter) params.recruiter_id = recruiterFilter;
    }
    api.getCandidates(params).then(setCandidates);
  };

  useEffect(() => {
    api.getJobs().then(setJobs);
    if (isHm) {
      api.getRecruiterStats().then(setTeamRecruiters).catch(() => setTeamRecruiters([]));
    }
    if (isAdmin) {
      api.getHiringManagers().then(setHiringManagers).catch(() => setHiringManagers([]));
    }
  }, [isHm, isAdmin]);

  useEffect(() => {
    if (!isAdmin || !hmFilter) {
      if (isAdmin) setTeamRecruiters([]);
      return;
    }
    api.getRecruiterStats({ hm_id: Number(hmFilter) })
      .then(setTeamRecruiters)
      .catch(() => setTeamRecruiters([]));
  }, [isAdmin, hmFilter]);

  useEffect(() => {
    setSelected(new Set());
    loadCandidates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, jobFilter, stageFilter, filterParam, hmScope, recruiterFilter, hmFilter]);

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

  const selectedCandidates = useMemo(
    () => candidates.filter((c) => selected.has(c.id)),
    [candidates, selected]
  );
  const allSelectedInOfferStage = selectedCandidates.length > 0 && selectedCandidates.every((c) => c.stage === 'selected');
  const allSelectedInScreening = selectedCandidates.length > 0 && selectedCandidates.every((c) => c.stage === 'screening');
  const allSelectedJoined = selectedCandidates.length > 0 && selectedCandidates.every((c) => c.stage === 'joined');

  const bulkOfferStatuses = new Set(['screening_rejected', 'offer_rejected', 'left_company']);

  const bulkUpdateStage = async () => {
    if (!bulkStage || selected.size === 0) return;
    if (bulkOfferStatuses.has(bulkStage)) {
      await api.bulkUpdateCandidates([...selected], { offer_status: bulkStage });
    } else {
      await api.bulkUpdateCandidates([...selected], { stage: bulkStage });
    }
    setSelected(new Set());
    setBulkStage('');
    loadCandidates();
  };

  const scopeParams = (): Record<string, string> => {
    if (isHm) {
      const p: Record<string, string> = { scope: hmScope };
      if (hmScope === 'team' && recruiterFilter) p.recruiter_id = recruiterFilter;
      return p;
    }
    if (isAdmin && hmFilter) {
      const p: Record<string, string> = { hm_id: hmFilter };
      if (recruiterFilter) p.recruiter_id = recruiterFilter;
      return p;
    }
    return {};
  };

  const setHmUrlFilter = (hmId: string) => {
    setRecruiterFilter('');
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (hmId) next.set('hm', hmId);
      else next.delete('hm');
      return next;
    }, { replace: true });
  };

  const bulkExport = () => {
    const params: Record<string, string> = { ids: [...selected].join(','), ...scopeParams() };
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
                ? hmScope === 'my'
                  ? 'Candidates you personally own — full control over stages and follow-ups.'
                  : 'Candidates managed by recruiters on your team. You can override any recruiter action.'
                : selectedHm
                  ? `Candidates owned by ${selectedHm.name} or recruiters on their team.`
                  : 'Search, filter, and bulk-manage your candidate registry.'
          }
          actions={
            <>
              <Link to="/candidates/mass-screen" className="button-pill button-secondary">Mass screen</Link>
              <Link to="/candidates/import" className="button-pill button-secondary">Import CSV</Link>
              <Link to="/candidates/new" className="button-pill button-primary">+ Add Candidate</Link>
            </>
          }
        />

        {isHm && (
          <Tabs
            tabs={[
              { id: 'my', label: 'My Candidates' },
              { id: 'team', label: 'My Team Candidates' },
            ]}
            active={hmScope}
            onChange={(id) => {
              setHmScope(id as HmScope);
              if (id === 'my') setRecruiterFilter('');
              setSearchParams((prev) => {
                const next = new URLSearchParams(prev);
                next.set('scope', id);
                return next;
              }, { replace: true });
            }}
          />
        )}

        <div className="filter-bar sticky">
          <select className="input-field filter-select" value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
            <option value="">All statuses</option>
            <optgroup label="Pipeline stage">
              <option value="applied">New / Applied</option>
              <option value="screening">Screening</option>
              <option value="interview">Interview</option>
              <option value="selected">Selected</option>
              <option value="email_sent">Email Sent</option>
              <option value="ho_pending">HO Pending</option>
              <option value="joined">Joined</option>
              <option value="rejected">Rejected</option>
            </optgroup>
            <optgroup label="Outcome">
              <option value="screening_rejected">Screening Rejected</option>
              <option value="offer_rejected">Offer Rejected</option>
              <option value="not_interested">Not Interested</option>
              <option value="joined_elsewhere">Joined Elsewhere</option>
              <option value="left_company">Left Company</option>
              <option value="doing_well">Doing Well</option>
              <option value="issue_flagged">Issue Flagged</option>
              <option value="no_answer">No Answer</option>
            </optgroup>
          </select>
          <select className="input-field filter-select" value={jobFilter} onChange={(e) => setJobFilter(e.target.value)}>
            <option value="">All jobs</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>{j.title}</option>
            ))}
          </select>
          {isAdmin && (
            <select
              className="input-field filter-select"
              value={hmFilter}
              onChange={(e) => setHmUrlFilter(e.target.value)}
            >
              <option value="">All hiring managers</option>
              {hiringManagers.map((hm) => (
                <option key={hm.id} value={hm.id}>
                  {hm.name}{hm.company ? ` — ${hm.company}` : ''}
                </option>
              ))}
            </select>
          )}
          {((isHm && hmScope === 'team') || (isAdmin && !!hmFilter)) && (
            <select
              className="input-field filter-select"
              value={recruiterFilter}
              onChange={(e) => setRecruiterFilter(e.target.value)}
            >
              <option value="">All recruiters</option>
              {teamRecruiters.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          )}
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
                <th>Risk</th>
                <th>Interview Date</th>
                <th>Joining Date</th>
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
                    {c.is_hot && <span className="hot-flame" title="Hot candidate">🔥</span>}
                  </td>
                  <td>{c.phone || '—'}</td>
                  <td>{c.job_title || '—'}</td>
                  <td><StatusBadge status={c.offer_status || c.stage} /></td>
                  <td>
                    {c.screening ? (
                      <span
                        className={riskBadgeClass(c.screening.risk_level)}
                        title={`Screening ${c.screening.total_score}/25 · Red flags ${c.screening.total_red_flags}/35`}
                      >
                        {c.screening.risk_level}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>{c.interview_date ? new Date(c.interview_date).toLocaleDateString() : '—'}</td>
                  <td>{c.joined_at ? new Date(c.joined_at).toLocaleDateString() : '—'}</td>
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
          <button type="button" className="button-pill button-secondary btn-sm" onClick={() => api.exportCandidates(scopeParams())}>Export CSV</button>
        </div>

        {selected.size > 0 && (
          <div className="bulk-bar">
            <span>{selected.size} selected</span>
            <select className="input-field btn-sm" value={bulkStage} onChange={(e) => setBulkStage(e.target.value)}>
              <option value="">Change status…</option>
              <option value="screening">Screening</option>
              {allSelectedInScreening && <option value="screening_rejected">Screening Rejected</option>}
              <option value="interview">Interview</option>
              <option value="selected">Selected</option>
              <option value="email_sent">Email Sent</option>
              <option value="ho_pending">HO Pending</option>
              {allSelectedInOfferStage && <option value="offer_rejected">Offer Rejected</option>}
              <option value="rejected">Rejected</option>
              <option value="joined">Joined</option>
              {allSelectedJoined && <option value="left_company">Left</option>}
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
            <p className="text-muted">
              {preview.job_title} · {preview.experience_years} yrs · Score {preview.ai_score}
              {preview.is_hot && <span className="hot-flame" title="Hot candidate">🔥 Hot</span>}
            </p>
            <StatusBadge status={preview.offer_status || preview.stage} />
            {preview.screening && (
              <p style={{ marginTop: '0.5rem' }}>
                <span className={riskBadgeClass(preview.screening.risk_level)}>{preview.screening.risk_level}</span>
                <span className="text-muted" style={{ marginLeft: '0.5rem' }}>
                  Screening {preview.screening.total_score}/25 · Red flags {preview.screening.total_red_flags}/35
                </span>
              </p>
            )}
            <div className="drawer-actions">
              <Link to={`/messages?candidate=${preview.id}&from=${encodeURIComponent('/candidates')}`} className="button-pill button-secondary btn-sm">WhatsApp</Link>
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
