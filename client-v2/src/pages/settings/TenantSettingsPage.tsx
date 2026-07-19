import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import TopBar from '../../components/ui/TopBar';
import PageHeader from '../../components/ui/PageHeader';
import PlanBadge from '../../components/ui/PlanBadge';
import { useTenant } from '../../context/TenantContext';
import { TENANT_PLANS } from '../../data/tenants';
import { extractBrandColorFromLogo } from '../../lib/brandColor';

export default function TenantSettingsPage() {
  const { tenant, can } = useTenant();
  const [orgName, setOrgName] = useState(tenant.name);
  const [primaryColor, setPrimaryColor] = useState(tenant.primaryColor);
  const [logoUrl, setLogoUrl] = useState<string | null>(tenant.logoUrl || null);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const plan = TENANT_PLANS[tenant.plan];
  const careersUrl = `${window.location.origin}/careers/${tenant.slug}`;

  useEffect(() => {
    api.getSettings().then((s) => {
      const branding = s.branding as {
        companyName?: string;
        primaryColor?: string;
        logoUrl?: string | null;
      } | undefined;
      if (branding?.companyName) setOrgName(branding.companyName);
      if (branding?.primaryColor) setPrimaryColor(branding.primaryColor);
      if (branding?.logoUrl !== undefined) setLogoUrl(branding.logoUrl || null);
    });
  }, []);

  const handleSave = async () => {
    setError('');
    try {
      await api.updateSetting('branding', { companyName: orgName, primaryColor });
      document.documentElement.style.setProperty('--tenant-primary', primaryColor);
      document.documentElement.style.setProperty('--primary', primaryColor);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleLogoUpload = async (file: File) => {
    setError('');
    setUploading(true);
    try {
      const extracted = await extractBrandColorFromLogo(file);
      const { logoUrl: next } = await api.uploadTenantLogo(file);
      setLogoUrl(next);
      if (extracted) {
        setPrimaryColor(extracted);
        await api.updateSetting('branding', { companyName: orgName, primaryColor: extracted });
        document.documentElement.style.setProperty('--tenant-primary', extracted);
        document.documentElement.style.setProperty('--primary', extracted);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleRemoveLogo = async () => {
    setError('');
    try {
      await api.deleteTenantLogo();
      setLogoUrl(null);
    } catch (err) {
      setError((err as Error).message);
    }
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
                Careers page:{' '}
                <a href={careersUrl} target="_blank" rel="noreferrer">
                  {careersUrl}
                </a>
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
              <p className="text-muted" style={{ marginBottom: '1rem' }}>
                Upload your company logo — we sample its colors to refresh your careers theme.
              </p>

              <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
                <div
                  style={{
                    width: 88,
                    height: 88,
                    borderRadius: 16,
                    background: logoUrl ? '#fff' : primaryColor,
                    border: '1px solid var(--border-strong)',
                    display: 'grid',
                    placeItems: 'center',
                    overflow: 'hidden',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: '1.4rem',
                  }}
                >
                  {logoUrl ? (
                    <img src={logoUrl} alt={`${orgName} logo`} style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 10 }} />
                  ) : (
                    tenant.logoInitials
                  )}
                </div>
                <div style={{ display: 'grid', gap: '0.5rem' }}>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleLogoUpload(file);
                    }}
                  />
                  <button
                    type="button"
                    className="button-pill button-primary"
                    disabled={uploading}
                    onClick={() => fileRef.current?.click()}
                  >
                    {uploading ? 'Uploading…' : logoUrl ? 'Replace logo' : 'Upload logo'}
                  </button>
                  {logoUrl && (
                    <button type="button" className="button-pill button-secondary" onClick={handleRemoveLogo}>
                      Remove logo
                    </button>
                  )}
                  <span className="text-muted" style={{ fontSize: '0.8rem' }}>PNG, JPEG, or WebP · max 2 MB</span>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="primaryColor">Primary color</label>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                  <input
                    id="primaryColor"
                    type="color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="color-input"
                  />
                  <code style={{ fontSize: '0.85rem' }}>{primaryColor}</code>
                </div>
              </div>

              <button type="button" className="button-pill button-primary" style={{ marginTop: '1rem' }} onClick={handleSave}>
                {saved ? 'Saved ✓' : 'Save branding'}
              </button>
              {error && <p style={{ color: '#b91c1c', marginTop: '0.75rem', fontSize: '0.9rem' }}>{error}</p>}
              {!can('white_label') && (
                <p className="text-muted" style={{ marginTop: '0.75rem' }}>White-label branding available on Enterprise plan.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
