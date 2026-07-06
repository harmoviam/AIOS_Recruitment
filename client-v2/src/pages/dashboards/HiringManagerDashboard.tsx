import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../../api/client';
import TopBar from '../../components/ui/TopBar';
import KpiCard from '../../components/ui/KpiCard';
import { useRefetchOnFocus } from '../../utils/useRefetchOnFocus';
import type { HmDashboard, TeamPerformance } from '../../types';

export default function HiringManagerDashboard() {
  const [data, setData] = useState<HmDashboard | null>(null);
  const [team, setTeam] = useState<TeamPerformance | null>(null);

  const load = () => {
    api.getHmDashboard().then(setData);
    api.getTeamPerformance().then(setTeam);
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

        <div className="dashboard-grid">
          <div className="card">
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
                <table className="data-table" style={{ marginTop: '1rem' }}>
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
                <div className="perf-stats" style={{ marginTop: '1rem' }}>
                  <div><span className="perf-value">{team!.team.candidates}</span><span className="perf-label">Team Candidates</span></div>
                  <div><span className="perf-value">{team!.team.joiningsMtd}</span><span className="perf-label">Team Joinings</span></div>
                  <div><span className="perf-value">{team!.team.pendingFollowups}</span><span className="perf-label">Open Follow-ups</span></div>
                </div>
              </>
            )}
          </div>

          <div className="card">
            <h3 className="card-heading">Pending My Approval</h3>
            {(data?.pendingApprovals?.length ?? 0) === 0 ? (
              <p className="text-muted">No pending approvals.</p>
            ) : (
              <table className="data-table compact">
                <thead><tr><th>Candidate</th><th>Job</th><th>Recruiter</th><th></th></tr></thead>
                <tbody>
                  {data!.pendingApprovals.map((p) => (
                    <tr key={p.id}>
                      <td><Link to={`/candidates/${p.id}`}>{p.name}</Link></td>
                      <td>{p.job_title || '—'}</td>
                      <td>{p.recruiter_name || '—'}</td>
                      <td><Link to={`/candidates/${p.id}`} className="button-pill button-primary btn-sm">Review</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
