import { Link, useParams } from 'react-router-dom';
import TopBar from '../../components/ui/TopBar';
import PageHeader from '../../components/ui/PageHeader';
import PlanBadge from '../../components/ui/PlanBadge';
import { MOCK_TENANTS, TENANT_PLANS, getTenantBySlug } from '../../data/tenants';
import { tenantLoginUrl, tenantSubdomainLoginUrl } from '../../utils/tenantUrl';

export default function TenantsPage() {
  const { slug } = useParams();
  const detail = slug ? getTenantBySlug(slug) : null;

  if (detail) {
    return (
      <>
        <TopBar breadcrumbs={[{ label: 'Platform', href: '/platform' }, { label: 'Tenants', href: '/platform/tenants' }, { label: detail.name }]} />
        <div className="page-content">
          <PageHeader
            title={detail.name}
            description={`Workspace: ${detail.slug}.aios.app — assign plan & status here. Recruitment is managed by the Organization Admin inside this workspace.`}
          />

          <div className="kpi-grid">
            <div className="card"><div className="card-title">Plan</div><PlanBadge plan={detail.plan} status={detail.status} /></div>
            <div className="card"><div className="card-title">Users</div><div className="card-value">{detail.usersCount}</div></div>
            <div className="card"><div className="card-title">Candidates</div><div className="card-value">{detail.candidatesCount.toLocaleString()}</div></div>
            <div className="card"><div className="card-title">Limits</div><div className="card-value" style={{ fontSize: '1rem' }}>{TENANT_PLANS[detail.plan].recruiters} recruiters · {TENANT_PLANS[detail.plan].candidates.toLocaleString()} candidates</div></div>
          </div>

          <div className="card" style={{ marginTop: '1rem' }}>
            <h3 className="card-heading">Sign-in URLs (share with Org Admin)</h3>
            <div className="detail-row"><span className="detail-label">Path URL</span><code>{tenantLoginUrl(detail.slug)}</code></div>
            <div className="detail-row"><span className="detail-label">Subdomain</span><code>{tenantSubdomainLoginUrl(detail.slug)}</code></div>
          </div>

          <div className="card">
            <h3 className="card-heading">Enabled Features</h3>
            <div className="feature-chips">
              {detail.features.map((f) => (
                <span key={f} className="skill-tag">{f.replace(/_/g, ' ')}</span>
              ))}
            </div>
          </div>

          {detail.trialEndsAt && (
            <div className="alert-banner warning">Trial ends {detail.trialEndsAt}</div>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar breadcrumbs={[{ label: 'Platform', href: '/platform' }, { label: 'Tenants' }]} />
      <div className="page-content">
        <PageHeader
          title="Client Organizations"
          description="Manage SaaS tenants — recruitment agencies on your platform."
          actions={<button type="button" className="button-pill button-primary">+ Provision Tenant</button>}
        />

        <div className="table-wrap card flush">
          <table className="data-table">
            <thead>
              <tr>
                <th>Organization</th>
                <th>Slug</th>
                <th>Sign-in URL</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Users</th>
                <th>Candidates</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {MOCK_TENANTS.map((t) => (
                <tr key={t.id}>
                  <td>
                    <span className="org-avatar sm inline" style={{ background: t.primaryColor }}>{t.logoInitials}</span>
                    {t.name}
                  </td>
                  <td className="text-muted">{t.slug}</td>
                  <td><code style={{ fontSize: '0.8rem' }}>/login/{t.slug}</code></td>
                  <td><PlanBadge plan={t.plan} /></td>
                  <td>{t.status}</td>
                  <td>{t.usersCount}</td>
                  <td>{t.candidatesCount.toLocaleString()}</td>
                  <td>
                    <Link to={`/platform/tenants/${t.slug}`} className="button-pill button-secondary btn-sm">Manage</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
