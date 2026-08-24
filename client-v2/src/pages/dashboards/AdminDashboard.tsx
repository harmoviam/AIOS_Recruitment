import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../../api/client';
import TopBar from '../../components/ui/TopBar';
import KpiCard from '../../components/ui/KpiCard';
import { useRefetchOnFocus } from '../../utils/useRefetchOnFocus';
import type { OrganizationOverview } from '../../types';

type StatusStep = {
  status: string;
  label: string;
  tone?: 'success' | 'danger' | 'warning';
};

const CANDIDATE_STATUS_FLOW: readonly StatusStep[] = [
  { status: 'applied', label: 'Applied' },
  { status: 'screening', label: 'Screening' },
  { status: 'interview', label: 'Interview' },
  { status: 'selected', label: 'Selected' },
  { status: 'email_sent', label: 'Email Sent' },
  { status: 'ho_pending', label: 'HO Pending' },
  { status: 'joined', label: 'Joined', tone: 'success' },
  { status: 'rejected', label: 'Rejected', tone: 'danger' },
];

const CANDIDATE_OUTCOMES: readonly StatusStep[] = [
  { status: 'screening_rejected', label: 'Screening Rejected', tone: 'danger' },
  { status: 'offer_rejected', label: 'Offer Rejected', tone: 'danger' },
  { status: 'not_interested', label: 'Not Interested', tone: 'danger' },
  { status: 'joined_elsewhere', label: 'Joined Elsewhere', tone: 'warning' },
  { status: 'doing_well', label: 'Doing Well', tone: 'success' },
  { status: 'issue_flagged', label: 'Issue Flagged', tone: 'warning' },
  { status: 'no_answer', label: 'No Answer', tone: 'warning' },
  { status: 'left_company', label: 'Left Company', tone: 'danger' },
];

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
  const statusCounts = new Map((data?.statusCounts ?? []).map((item) => [item.status, Number(item.count) || 0]));
  const statusFlow = CANDIDATE_STATUS_FLOW.map((item) => ({
    ...item,
    count: statusCounts.get(item.status) ?? 0,
  }));
  const outcomeCounts = CANDIDATE_OUTCOMES.map((item) => ({
    ...item,
    count: statusCounts.get(item.status) ?? 0,
  }));
  const stageCounts = new Map((data?.funnel ?? []).map((item) => [item.stage, Number(item.count) || 0]));
  const funnelData = CANDIDATE_STATUS_FLOW.map((item) => ({
    ...item,
    count: stageCounts.get(item.status) ?? 0,
  }));

  return (
    <>
      <TopBar breadcrumbs={[{ label: 'Dashboard' }, { label: 'Organization Admin' }]} />
      <div className="page-content">
        <h1 className="section-title">Organization Overview</h1>
        <p className="section-description">
          Monitor all hiring managers, recruiters, and placement progress across your organization.
        </p>

        <div className="admin-total-grid">
          <KpiCard title="Total Candidates" value={kpis?.candidates ?? '—'} href="/candidates" />
        </div>

        <section className="candidate-status-section" aria-labelledby="candidate-status-heading">
          <div className="card-header-row">
            <div>
              <h2 id="candidate-status-heading" className="card-heading">Candidate Status Flow</h2>
              <p className="text-muted">Every pipeline stage in hiring order. Select a status to view its candidates.</p>
            </div>
            <span className="pipeline-total">Joined this month: <strong>{kpis?.joinings_mtd ?? 0}</strong></span>
          </div>
          <div className="candidate-status-flow">
            {statusFlow.map((item) => (
              <Link
                key={item.status}
                to={`/candidates?filter=${item.status}`}
                className={`candidate-status-step${item.tone ? ` ${item.tone}` : ''}`}
              >
                <span className="candidate-status-label">{item.label}</span>
                <strong className="candidate-status-count">{item.count}</strong>
              </Link>
            ))}
          </div>
          <h3 className="candidate-outcome-heading">Outcome &amp; Follow-up Statuses</h3>
          <div className="candidate-status-flow outcomes">
            {outcomeCounts.map((item) => (
              <Link
                key={item.status}
                to={`/candidates?filter=${item.status}`}
                className={`candidate-status-step${item.tone ? ` ${item.tone}` : ''}`}
              >
                <span className="candidate-status-label">{item.label}</span>
                <strong className="candidate-status-count">{item.count}</strong>
              </Link>
            ))}
          </div>
        </section>

        <div className="dashboard-grid">
          <div className="card">
            <div className="card-header-row">
              <h3 className="card-heading">Hiring Managers & Teams</h3>
              <Link to="/hiring-managers" className="link-button">Manage HMs →</Link>
            </div>
            <div className="table-wrap">
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
          </div>

          <div className="card">
            <h3 className="card-heading">Org Pipeline Funnel</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={funnelData}>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
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
          <div className="table-wrap">
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
