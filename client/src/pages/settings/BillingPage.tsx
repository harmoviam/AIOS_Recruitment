import { Link } from 'react-router-dom';
import TopBar from '../../components/ui/TopBar';
import PageHeader from '../../components/ui/PageHeader';
import PlanBadge from '../../components/ui/PlanBadge';
import { useTenant } from '../../context/TenantContext';
import { TENANT_PLANS } from '../../data/tenants';

const PLANS = [
  { id: 'starter' as const, price: '₹4,999/mo', highlights: ['3 recruiters', '2K candidates', 'WhatsApp inbox'] },
  { id: 'pro' as const, price: '₹14,999/mo', highlights: ['15 recruiters', '25K candidates', 'AI calling', 'Automation'], popular: true },
  { id: 'enterprise' as const, price: 'Custom', highlights: ['Unlimited', 'SSO & API', 'White-label', 'Dedicated support'] },
];

export default function BillingPage() {
  const { tenant } = useTenant();

  return (
    <>
      <TopBar breadcrumbs={[{ label: 'Settings', href: '/settings' }, { label: 'Billing' }]} />
      <div className="page-content">
        <PageHeader title="Billing & Plan" description="Manage subscription and usage for your organization." />

        <div className="alert-banner info">
          Current plan: <PlanBadge plan={tenant.plan} status={tenant.status} />
          {tenant.status === 'trial' && tenant.trialEndsAt && (
            <span> — Trial ends {tenant.trialEndsAt}</span>
          )}
        </div>

        <div className="plan-grid">
          {PLANS.map((p) => (
            <div key={p.id} className={`plan-card${p.id === tenant.plan ? ' current' : ''}${p.popular ? ' popular' : ''}`}>
              {p.popular && <span className="plan-popular-tag">Most popular</span>}
              <h3>{TENANT_PLANS[p.id].label}</h3>
              <div className="plan-price">{p.price}</div>
              <ul className="plan-features">
                {p.highlights.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
              {p.id === tenant.plan ? (
                <button type="button" className="button-pill button-secondary" disabled>Current plan</button>
              ) : (
                <button type="button" className="button-pill button-primary">Upgrade</button>
              )}
            </div>
          ))}
        </div>

        <div className="card" style={{ marginTop: '1.5rem' }}>
          <h3 className="card-heading">Usage this period</h3>
          <div className="usage-bars">
            <div>
              <span>Recruiters: {tenant.usersCount} / {TENANT_PLANS[tenant.plan].recruiters}</span>
              <div className="usage-track"><div className="usage-fill" style={{ width: `${Math.min(100, (tenant.usersCount / TENANT_PLANS[tenant.plan].recruiters) * 100)}%` }} /></div>
            </div>
            <div>
              <span>Candidates: {tenant.candidatesCount.toLocaleString()} / {TENANT_PLANS[tenant.plan].candidates.toLocaleString()}</span>
              <div className="usage-track"><div className="usage-fill" style={{ width: `${Math.min(100, (tenant.candidatesCount / TENANT_PLANS[tenant.plan].candidates) * 100)}%` }} /></div>
            </div>
          </div>
        </div>

        <p className="text-muted" style={{ marginTop: '1rem' }}>
          <Link to="/settings/organization">← Organization settings</Link>
        </p>
      </div>
    </>
  );
}
