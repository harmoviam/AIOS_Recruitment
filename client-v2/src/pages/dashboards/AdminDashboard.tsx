import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../../api/client';
import TopBar from '../../components/ui/TopBar';
import KpiCard from '../../components/ui/KpiCard';
import { useRefetchOnFocus } from '../../utils/useRefetchOnFocus';
import type { OrganizationOverview } from '../../types';

export default function AdminDashboard() {
  const [data, setData] = useState<OrganizationOverview | null>(null);

  const load = () => {
    api.getOrganizationOverview().then(setData);
  };

  useEffect(() => {
    load();
  }, []);
  useRefetchOnFocus(load);

  const kpis = data?.kpis;

  return (
    <>
      <TopBar breadcrumbs={[{ label: 'Dashboard' }, { label: 'Organization Admin' }]} />
      <div className="page-content">
        <h1 className="section-title">Organization Overview</h1>
        <p className="section-description">
          Monitor all hiring managers, recruiters, and placement progress across your organization.
        </p>

        <div className="kpi-grid">
          <KpiCard title="Hiring Managers" value={kpis?.hiring_managers ?? '—'} href="/hiring-managers" />
          <KpiCard title="Recruiters" value={kpis?.recruiters ?? '—'} href="/recruiters" />
          <KpiCard title="Total Candidates" value={kpis?.candidates ?? '—'} href="/candidates" />
          <KpiCard title="Selected" value={kpis?.selected ?? '—'} meta="Offer stage" href="/candidates?filter=selected" />
          <KpiCard title="Joined" value={kpis?.joined ?? '—'} meta={`${kpis?.joinings_mtd ?? 0} this month`} href="/candidates?filter=joined" />
        </div>

        <div className="dashboard-grid">
          <div className="card">
            <div className="card-header-row">
              <h3 className="card-heading">Hiring Managers & Teams</h3>
              <Link to="/hiring-managers" className="link-button">Manage HMs →</Link>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>HM</th>
                  <th>Company</th>
                  <th>Recruiters</th>
                  <th>Team Candidates</th>
                  <th>Joinings MTD</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(data?.hiringManagers ?? []).map((hm) => (
                  <tr key={hm.id}>
                    <td><strong>{hm.name}</strong><br /><span className="text-muted">{hm.email}</span></td>
                    <td>{hm.company}</td>
                    <td>{hm.recruiterCount}</td>
                    <td>{hm.teamCandidates}</td>
                    <td>{hm.teamJoiningsMtd}</td>
                    <td><Link to={`/recruiters?hm=${hm.id}`} className="button-pill button-secondary btn-sm">Manage team</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h3 className="card-heading">Org Pipeline Funnel</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data?.funnel ?? []}>
                <XAxis dataKey="stage" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="var(--primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="card-header-row">
            <h3 className="card-heading">All Recruiters — Performance</h3>
            <Link to="/recruiters" className="link-button">Manage recruiters →</Link>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Recruiter</th>
                <th>Company</th>
                <th>Hiring Manager</th>
                <th>Candidates</th>
                <th>Joinings MTD</th>
              </tr>
            </thead>
            <tbody>
              {(data?.recruiters ?? []).map((r) => (
                <tr key={r.id}>
                  <td>#{r.rank}</td>
                  <td><strong>{r.name}</strong></td>
                  <td>{r.company}</td>
                  <td>{r.hiringManager}</td>
                  <td>{r.candidates}</td>
                  <td>{r.joiningsMtd}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="quick-link-grid" style={{ marginTop: '1rem' }}>
          <Link to="/hiring-managers" className="quick-link-card">Add Hiring Manager</Link>
          <Link to="/recruiters" className="quick-link-card">Manage Recruiters</Link>
          <Link to="/companies" className="quick-link-card">Companies</Link>
          <Link to="/reports" className="quick-link-card">Reports</Link>
        </div>
      </div>
    </>
  );
}
