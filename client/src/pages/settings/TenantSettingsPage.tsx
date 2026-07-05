import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import TopBar from '../../components/ui/TopBar';
import PageHeader from '../../components/ui/PageHeader';
import PlanBadge from '../../components/ui/PlanBadge';
import { useTenant } from '../../context/TenantContext';
import { TENANT_PLANS } from '../../data/tenants';

export default function TenantSettingsPage() {
  const { tenant, can } = useTenant();
  const [orgName, setOrgName] = useState(tenant.name);
  const [primaryColor, setPrimaryColor] = useState(tenant.primaryColor);
  const [saved, setSaved] = useState(false);
  const plan = TENANT_PLANS[tenant.plan];

  useEffect(() => {
    api.getSettings().then((s) => {
      const branding = s.branding as { companyName?: string; primaryColor?: string } | undefined;
      if (branding?.companyName) setOrgName(branding.companyName);
      if (branding?.primaryColor) setPrimaryColor(branding.primaryColor);
    });
  }, []);

  const handleSave = async () => {
    await api.updateSetting('branding', { companyName: orgName, primaryColor });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <>
      <TopBar breadcrumbs={[{ label: 'Settings', href: '/settings' }, { label: 'Organization' }]} />
      <div className="page-content">
        <PageHeader title="Organization Settings" description="Manage your workspace identity, plan, and branding." />

        <div className="setting-panel">
          <div className="setting-nav">
            <Link to="/settings" className="nav-item">General</Link>
            <Link to="/settings/organization" className="nav-item active">Organization</Link>
            <Link to="/settings/billing" className="nav-item">Billing & Plan</Link>
            <Link to="/settings/profile" className="nav-item">Profile</Link>
          </div>

          <div className="setting-content">
            <div className="setting-card">
              <div className="setting-heading">Workspace</div>
              <p className="text-muted" style={{ marginBottom: '1rem' }}>
                URL: <strong>{tenant.slug}.aios.app</strong>
              </p>
              <div className="form-group">
                <label className="form-label" htmlFor="orgName">Organization name</label>
                <input id="orgName" className="input-field" value={orgName} onChange={(e) => setOrgName(e.target.value)} />
              </div>
              <button type="button" className="button-pill button-primary" style={{ marginTop: '1rem' }} onClick={handleSave}>
                {saved ? 'Saved ✓' : 'Save'}
              </button>
            </div>

            <div className="setting-card">
              <div className="setting-heading">Current Plan</div>
              <PlanBadge plan={tenant.plan} status={tenant.status} />
              <p className="text-muted" style={{ margin: '0.75rem 0' }}>
                Up to {plan.recruiters} recruiters · {plan.candidates.toLocaleString()} candidates
              </p>
              <Link to="/settings/billing" className="button-pill button-secondary">Upgrade plan</Link>
            </div>

            <div className="setting-card">
              <div className="setting-heading">Branding</div>
              <div className="form-group">
                <label className="form-label">Primary color</label>
                <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="color-input" />
              </div>
              {!can('white_label') && (
                <p className="text-muted">White-label branding available on Enterprise plan.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
