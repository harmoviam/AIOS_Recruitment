import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../../api/client';
import TopBar from '../../components/ui/TopBar';
import KpiCard from '../../components/ui/KpiCard';
import { useRefetchOnFocus } from '../../utils/useRefetchOnFocus';
import type { Candidate, HmDashboard, TeamPerformance } from '../../types';

export default function HiringManagerDashboard() {
  const [data, setData] = useState<HmDashboard | null>(null);
  const [team, setTeam] = useState<TeamPerformance | null>(null);
  const [hotCandidates, setHotCandidates] = useState<Candidate[]>([]);

  const load = () => {
    api.getHmDashboard().then(setData);
    api.getTeamPerformance().then(setTeam);
    api.getCandidates({ hot: 'true' }).then(setHotCandidates).catch(() => setHotCandidates([]));
  };

  useEffect(() => {
    load();
  }, []);
  useRefetchOnFocus(load);

  return (
    <>
      <TopBar breadcrumbs={[{ label: 'Dashboard' }, { label: 'Hiring Manager' }]} />
      <div className="page-content">
        <h1 className="section-title">Hiring Manager Dashboard</h1>
        <p className="section-description">
          Manage your recruiter team, track individual performance, and monitor overall team progress.
        </p>

        <div className="kpi-grid">
          <KpiCard title="My Recruiters" value={data?.recruiterCount ?? team?.recruiters.length ?? '—'} href="/recruiters" />
          <KpiCard title="Team Candidates" value={team?.team.candidates ?? '—'} href="/candidates" />
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
              <h3 className="card-heading">🔥 Hot Candidates</h3>
              <Link to="/candidates?filter=hot" className="link-button">View all</Link>
            </div>
            {hotCandidates.length === 0 ? (
              <p className="text-muted">No hot candidates flagged by your team yet.</p>
            ) : (
              hotCandidates.slice(0, 5).map((c) => (
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
      </div>
    </>
  );
}
