import { Link } from 'react-router-dom';
import TopBar from '../../components/ui/TopBar';
import KpiCard from '../../components/ui/KpiCard';
import { MOCK_TENANTS } from '../../data/tenants';

export default function PlatformDashboardPage() {
  const active = MOCK_TENANTS.filter((t) => t.status === 'active').length;
  const trial = MOCK_TENANTS.filter((t) => t.status === 'trial').length;
  const totalUsers = MOCK_TENANTS.reduce((s, t) => s + t.usersCount, 0);

  return (
    <>
      <TopBar breadcrumbs={[{ label: 'Platform' }]} />
      <div className="page-content">
        <h1 className="section-title">Platform Overview</h1>
        <p className="section-description">Master admin control plane — provision organizations, assign plans, monitor usage. Does not manage recruiters or candidates.</p>

        <div className="kpi-grid">
          <KpiCard title="Active Tenants" value={active} href="/platform/tenants" />
          <KpiCard title="On Trial" value={trial} meta={`${trial} expiring soon`} metaVariant="warning" />
          <KpiCard title="Total Users" value={totalUsers} />
          <KpiCard title="MRR (est.)" value="₹4.2L" meta="↑ 8% MoM" />
        </div>

        <div className="card">
          <div className="card-header-row">
            <h3 className="card-heading">Client Organizations</h3>
            <Link to="/platform/tenants" className="link-button">View all →</Link>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Organization</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Users</th>
                <th>Candidates</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_TENANTS.map((t) => (
                <tr key={t.id}>
                  <td>
                    <Link to={`/platform/tenants/${t.slug}`}>
                      <span className="org-avatar sm inline" style={{ background: t.primaryColor }}>{t.logoInitials}</span>
                      {t.name}
                    </Link>
                  </td>
                  <td><span className={`plan-badge plan-${t.plan}`}>{t.plan}</span></td>
                  <td>{t.status}</td>
                  <td>{t.usersCount}</td>
                  <td>{t.candidatesCount.toLocaleString()}</td>
                  <td className="text-muted">{t.createdAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
