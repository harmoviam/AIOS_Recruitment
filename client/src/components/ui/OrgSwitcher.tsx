import { useState, useRef, useEffect } from 'react';
import { useTenant } from '../../context/TenantContext';
import { TENANT_PLANS } from '../../data/tenants';

export default function OrgSwitcher() {
  const { tenant, tenants, switchTenant, isPlatformAdmin } = useTenant();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (tenants.length <= 1 && !isPlatformAdmin) {
    return (
      <div className="org-switcher org-switcher-static" title={tenant.name}>
        <span className="org-avatar" style={{ background: tenant.primaryColor }}>{tenant.logoInitials}</span>
        {!isPlatformAdmin && <span className="org-name">{tenant.name}</span>}
      </div>
    );
  }

  return (
    <div className="org-switcher" ref={ref}>
      <button type="button" className="org-switcher-trigger" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="org-avatar" style={{ background: tenant.primaryColor }}>{tenant.logoInitials}</span>
        <span className="org-name">{tenant.name}</span>
        <span className="org-chevron">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="org-dropdown" role="menu">
          <div className="org-dropdown-header">
            {isPlatformAdmin ? 'Switch workspace' : 'Your workspace'}
          </div>
          {tenants.map((t) => (
            <button
              key={t.slug}
              type="button"
              role="menuitem"
              className={`org-option${t.slug === tenant.slug ? ' active' : ''}`}
              onClick={() => {
                switchTenant(t.slug);
                setOpen(false);
              }}
            >
              <span className="org-avatar sm" style={{ background: t.primaryColor }}>{t.logoInitials}</span>
              <span className="org-option-text">
                <strong>{t.name}</strong>
                <span className="text-muted">{TENANT_PLANS[t.plan].label} · {t.slug}</span>
              </span>
              {t.slug === tenant.slug && <span className="org-check">✓</span>}
            </button>
          ))}
          {isPlatformAdmin && (
            <a href="/platform/tenants" className="org-dropdown-footer" onClick={() => setOpen(false)}>
              Manage all clients →
            </a>
          )}
        </div>
      )}
    </div>
  );
}
