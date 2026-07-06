import { Link } from 'react-router-dom';
import TopBar from '../../components/ui/TopBar';
import PageHeader from '../../components/ui/PageHeader';
import { TENANT_PLANS } from '../../data/tenants';
import type { TenantPlan } from '../../types';

const PLAN_ORDER: TenantPlan[] = ['starter', 'pro', 'enterprise'];

export default function PlatformPlansPage() {
  return (
    <>
      <TopBar breadcrumbs={[{ label: 'Platform', href: '/platform' }, { label: 'Plans & Pricing' }]} />
      <div className="page-content">
        <PageHeader
          title="Plans & Pricing"
          description="Master admin defines SaaS plans. Assign a plan per organization under Organizations."
        />

        <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {PLAN_ORDER.map((key) => {
            const plan = TENANT_PLANS[key];
            return (
              <div key={key} className="card">
                <div className="card-title">{plan.label}</div>
                <div className="card-value" style={{ fontSize: '1.25rem', textTransform: 'capitalize' }}>{key}</div>
                <ul style={{ margin: '1rem 0 0', paddingLeft: '1.25rem', fontSize: '0.9rem', lineHeight: 1.7 }}>
                  <li>Up to {plan.recruiters} recruiters</li>
                  <li>Up to {plan.candidates.toLocaleString()} candidates</li>
                </ul>
              </div>
            );
          })}
        </div>

        <div className="card" style={{ marginTop: '1rem' }}>
          <p className="text-muted" style={{ margin: 0 }}>
            Organization Admins manage recruiters and hiring within their workspace. Platform Admin only provisions organizations and assigns plans — not day-to-day recruitment.
          </p>
          <Link to="/platform/tenants" className="link-button" style={{ display: 'inline-block', marginTop: '0.75rem' }}>
            Manage organizations →
          </Link>
        </div>
      </div>
    </>
  );
}
