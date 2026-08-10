import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList } from 'recharts';
import { api } from '../../api/client';
import TopBar from '../../components/ui/TopBar';
import KpiCard from '../../components/ui/KpiCard';
import Tabs from '../../components/ui/Tabs';
import { useRefetchOnFocus } from '../../utils/useRefetchOnFocus';
import type { Candidate, FollowUp, HmDashboard, Interview, RecruiterWorkflow, TeamPerformance, WorkflowPeriod } from '../../types';

type DashboardTab = 'my' | 'recruiters';

const PERIOD_OPTIONS: { id: WorkflowPeriod; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: 'Last 7 days' },
  { id: '30d', label: 'Last month' },
];

function localDateParam(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function periodLabel(period: WorkflowPeriod) {
  return PERIOD_OPTIONS.find((p) => p.id === period)?.label ?? 'Today';
}

export default function HiringManagerDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const periodParam = searchParams.get('period');
  const [tab, setTab] = useState<DashboardTab>(tabParam === 'recruiters' ? 'recruiters' : 'my');
  const [period, setPeriod] = useState<WorkflowPeriod>(
    periodParam === '7d' || periodParam === '30d' ? periodParam : 'today'
  );

  const [data, setData] = useState<HmDashboard | null>(null);
  const [team, setTeam] = useState<TeamPerformance | null>(null);
  const [workflow, setWorkflow] = useState<RecruiterWorkflow | null>(null);
  const [hotMine, setHotMine] = useState<Candidate[]>([]);
  const [hotTeam, setHotTeam] = useState<Candidate[]>([]);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);

  useEffect(() => {
    if (tabParam === 'my' || tabParam === 'recruiters') setTab(tabParam);
  }, [tabParam]);

  useEffect(() => {
    if (periodParam === 'today' || periodParam === '7d' || periodParam === '30d') {
      setPeriod(periodParam);
    } else if (!periodParam) {
      setPeriod('today');
    }
  }, [periodParam]);

  const loadShared = useCallback(() => {
    const today = localDateParam();
    api.getHmDashboard().then(setData);
    api.getTeamPerformance().then(setTeam);
    api.getCandidates({ hot: 'true', scope: 'my' }).then(setHotMine).catch(() => setHotMine([]));
    api.getCandidates({ hot: 'true', scope: 'team' }).then(setHotTeam).catch(() => setHotTeam([]));
    api.getInterviews({ date: today }).then((ivs) => setInterviews(ivs.slice(0, 4))).catch(() => setInterviews([]));
    api.getFollowUps()
      .then((fus) => setFollowUps(fus.filter((f) => f.status !== 'completed').slice(0, 5)))
      .catch(() => setFollowUps([]));
  }, []);

  const loadWorkflow = useCallback((p: WorkflowPeriod) => {
    api.getMyWorkflow(p).then(setWorkflow).catch(() => setWorkflow(null));
  }, []);

  const load = useCallback(() => {
    loadShared();
    loadWorkflow(period);
  }, [loadShared, loadWorkflow, period]);

  useEffect(() => {
    loadShared();
  }, [loadShared]);

  useEffect(() => {
    loadWorkflow(period);
  }, [loadWorkflow, period]);

  useRefetchOnFocus(load);

  const switchTab = (id: string) => {
    const next = id as DashboardTab;
    setTab(next);
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set('tab', next);
      return p;
    }, { replace: true });
  };

  const switchPeriod = (id: WorkflowPeriod) => {
    setPeriod(id);
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set('period', id);
      return p;
    }, { replace: true });
  };

  const kpis = workflow?.kpis;
  const funnelData = workflow?.pipeline ?? [];
  const pipelineTotal = funnelData.reduce((sum, s) => sum + s.count, 0);
  const interviewsTitle = period === 'today' ? 'Interviews Today' : 'Interviews';

  return (
    <>
      <TopBar breadcrumbs={[{ label: 'Dashboard' }, { label: 'Hiring Manager' }]} />
      <div className="page-content">
        <h1 className="section-title">Hiring Manager Dashboard</h1>
        <p className="section-description">
          {tab === 'my'
            ? 'Your personal desk — candidates you own, approvals, and today\'s work.'
            : 'Manage your recruiter team, track individual performance, and monitor overall team progress.'}
        </p>

        <Tabs
          tabs={[
            { id: 'my', label: 'My Desk' },
            { id: 'recruiters', label: 'My Recruiters', count: data?.recruiterCount ?? team?.recruiters.length },
          ]}
          active={tab}
          onChange={switchTab}
        />

        {tab === 'my' ? (
          <>
            <div className="period-filters" role="group" aria-label="Count period">
              {PERIOD_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`period-filter-btn${period === opt.id ? ' active' : ''}`}
                  onClick={() => switchPeriod(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="kpi-grid">
              <KpiCard title="My Candidates" value={kpis?.totalCandidates ?? '—'} meta={periodLabel(period)} href="/candidates?scope=my" />
              <KpiCard
                title="Follow-ups"
                value={kpis?.pendingFollowups ?? '—'}
                meta={`${kpis?.overdueFollowups ?? 0} overdue`}
                metaVariant="warning"
                href="/follow-ups"
              />
              <KpiCard title={interviewsTitle} value={kpis?.interviewsToday ?? '—'} href="/interviews" />
              <KpiCard title="Open Positions" value={data?.openPositions ?? '—'} href="/jobs" />
              <KpiCard
                title="Pending Approvals"
                value={data?.pendingApprovals?.length ?? '—'}
                meta="Selected stage"
              />
              <KpiCard
                title="Joined"
                value={kpis?.joined ?? '—'}
                meta={periodLabel(period)}
                href="/candidates?scope=my&filter=joined"
              />
            </div>

            <div className="kpi-grid">
              <KpiCard title="Selected" value={kpis?.selected ?? '—'} href="/candidates?scope=my&filter=selected" />
              <KpiCard title="Rejected" value={kpis?.rejected ?? '—'} href="/candidates?scope=my&filter=rejected" />
              <KpiCard title="HO Pending" value={kpis?.hoPending ?? '—'} href="/candidates?scope=my&filter=ho_pending" />
              <KpiCard title="Email Sent" value={kpis?.emailSent ?? '—'} href="/candidates?scope=my&filter=email_sent" />
            </div>

            <div className="dashboard-grid">
              <div className="card">
                <div className="card-header-row">
                  <h3 className="card-heading">My Pipeline</h3>
                  <span className="pipeline-total">
                    {periodLabel(period)}: <strong>{pipelineTotal}</strong> candidates
                  </span>
                </div>
                {funnelData.length === 0 ? (
                  <p className="text-muted">
                    No candidates added in this period.{' '}
                    <Link to="/candidates/new">Add a candidate</Link> or try a wider date range.
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={funnelData} margin={{ top: 16 }}>
                      <XAxis dataKey="stage" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="count" fill="var(--primary)" radius={[4, 4, 0, 0]}>
                        <LabelList dataKey="count" position="top" style={{ fontSize: 11, fill: 'var(--text-secondary)', fontWeight: 600 }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="card">
                <h3 className="card-heading">Pending My Approval</h3>
                {(data?.pendingApprovals?.length ?? 0) === 0 ? (
                  <p className="text-muted">No pending approvals.</p>
                ) : (
                  <div className="approval-list">
                    {data!.pendingApprovals.map((p) => (
                      <div key={p.id} className="approval-item">
                        <div className="approval-info">
                          <Link to={`/candidates/${p.id}`}><strong>{p.name}</strong></Link>
                          <span className="approval-meta" title={p.job_title || undefined}>
                            {p.job_title || '—'}{p.recruiter_name ? ` · ${p.recruiter_name}` : ''}
                          </span>
                        </div>
                        <Link to={`/candidates/${p.id}`} className="button-pill button-primary btn-sm">Review</Link>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="dashboard-grid">
              <div className="card">
                <div className="card-header-row">
                  <h3 className="card-heading">🔥 My Hot Candidates</h3>
                  <Link to="/candidates?scope=my&filter=hot" className="link-button">View all</Link>
                </div>
                {hotMine.length === 0 ? (
                  <p className="text-muted">No hot candidates in your personal pipeline yet.</p>
                ) : (
                  hotMine.slice(0, 5).map((c) => (
                    <div key={c.id} className="suggestion-item">
                      <Link to={`/candidates/${c.id}`}><strong>{c.name}</strong></Link>
                      <span className="text-muted"> · {c.stage}{c.job_title ? ` · ${c.job_title}` : ''}</span>
                    </div>
                  ))
                )}
              </div>

              <div className="card">
                <div className="card-header-row">
                  <h3 className="card-heading">Pending Follow-ups</h3>
                  <Link to="/follow-ups" className="link-button">View all</Link>
                </div>
                {followUps.length === 0 ? (
                  <p className="text-muted">No pending follow-ups.</p>
                ) : (
                  followUps.map((f) => (
                    <div key={f.id} className="schedule-slot">
                      <Link to={`/candidates/${f.candidate_id}`}><strong>{f.candidate_name}</strong></Link>
                      <span className="text-muted"> · {f.status} · {f.type}</span>
                    </div>
                  ))
                )}
              </div>

              <div className="card">
                <div className="card-header-row">
                  <h3 className="card-heading">Today&apos;s Interviews</h3>
                  <Link to="/interviews" className="link-button">View all</Link>
                </div>
                {interviews.length === 0 ? (
                  <p className="text-muted">No interviews today. <Link to="/interviews">Schedule one</Link></p>
                ) : (
                  interviews.map((iv) => (
                    <div key={iv.id} className="schedule-slot">
                      <div className="slot-time">{new Date(iv.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                      <div className="slot-candidate">{iv.candidate_name} — {iv.round_type}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="kpi-grid">
              <KpiCard title="My Recruiters" value={data?.recruiterCount ?? team?.recruiters.length ?? '—'} href="/recruiters" />
              <KpiCard title="Team Candidates" value={team?.team.candidates ?? '—'} href="/candidates?scope=team" />
              <KpiCard title="In Interview" value={team?.team.inInterview ?? '—'} href="/pipeline" />
              <KpiCard title="Team Joinings MTD" value={team?.team.joiningsMtd ?? data?.joiningsMtd ?? '—'} />
            </div>

            <div className="card" style={{ marginBottom: '1rem' }}>
              <div className="card-header-row">
                <h3 className="card-heading">Recruiter Performance (My Team)</h3>
                <Link to="/recruiters" className="button-pill button-primary btn-sm">+ Add Recruiter</Link>
              </div>
              {(team?.recruiters.length ?? 0) === 0 ? (
                <p className="text-muted">No recruiters yet. Add recruiters to start building your team.</p>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={team!.recruiters}>
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Bar dataKey="joiningsMtd" name="Joinings MTD" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="candidates" name="Candidates" fill="#94A3B8" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="table-wrap" style={{ marginTop: '1rem' }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Rank</th>
                          <th>Recruiter</th>
                          <th>Candidates</th>
                          <th>Interviews</th>
                          <th>Follow-ups</th>
                          <th>Joinings MTD</th>
                          <th>Conversion</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {team!.recruiters.map((r) => (
                          <tr key={r.id}>
                            <td>#{r.rank}</td>
                            <td><strong>{r.name}</strong></td>
                            <td>{r.candidates}</td>
                            <td>{r.inInterview}</td>
                            <td>{r.pendingFollowups}</td>
                            <td>{r.joiningsMtd}</td>
                            <td>{r.conversionRate}%</td>
                            <td><Link to="/recruiters" className="button-pill button-secondary btn-sm">Manage</Link></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="perf-stats" style={{ marginTop: '1rem' }}>
                    <div><span className="perf-value">{team!.team.candidates}</span><span className="perf-label">Team Candidates</span></div>
                    <div><span className="perf-value">{team!.team.joiningsMtd}</span><span className="perf-label">Team Joinings</span></div>
                    <div><span className="perf-value">{team!.team.pendingFollowups}</span><span className="perf-label">Open Follow-ups</span></div>
                  </div>
                </>
              )}
            </div>

            <div className="dashboard-grid">
              <div className="card">
                <div className="card-header-row">
                  <h3 className="card-heading">🔥 Team Hot Candidates</h3>
                  <Link to="/candidates?scope=team&filter=hot" className="link-button">View all</Link>
                </div>
                {hotTeam.length === 0 ? (
                  <p className="text-muted">No hot candidates flagged by your team yet.</p>
                ) : (
                  hotTeam.slice(0, 5).map((c) => (
                    <div key={c.id} className="suggestion-item">
                      <Link to={`/candidates/${c.id}`}><strong>{c.name}</strong></Link>
                      <span className="text-muted"> · {c.stage}{c.job_title ? ` · ${c.job_title}` : ''}{c.recruiter_name ? ` · ${c.recruiter_name}` : ''}</span>
                    </div>
                  ))
                )}
              </div>

              <div className="card">
                <h3 className="card-heading">Pending My Approval</h3>
                {(data?.pendingApprovals?.length ?? 0) === 0 ? (
                  <p className="text-muted">No pending approvals.</p>
                ) : (
                  <div className="approval-list">
                    {data!.pendingApprovals.map((p) => (
                      <div key={p.id} className="approval-item">
                        <div className="approval-info">
                          <Link to={`/candidates/${p.id}`}><strong>{p.name}</strong></Link>
                          <span className="approval-meta" title={p.job_title || undefined}>
                            {p.job_title || '—'}{p.recruiter_name ? ` · ${p.recruiter_name}` : ''}
                          </span>
                        </div>
                        <Link to={`/candidates/${p.id}`} className="button-pill button-primary btn-sm">Review</Link>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
