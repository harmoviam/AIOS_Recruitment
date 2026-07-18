import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { getTenantLogoUrl } from '../../data/tenantLogos';
import { pollPath } from '../../utils/pollSession';

const DEFAULT_PRIMARY = '#2563EB';

type PollTheme = {
  name: string;
  logoInitials: string;
  primaryColor: string;
  logoUrl: string | null;
};

export default function PollShell({
  children,
  subtitle = 'Recruiter knowledge check',
  tenantSlug,
  tenantName,
  primaryColor,
  logoInitials,
  logoUrl,
}: {
  children: ReactNode;
  subtitle?: string;
  tenantSlug?: string;
  tenantName?: string;
  primaryColor?: string;
  logoInitials?: string;
  logoUrl?: string | null;
}) {
  const [theme, setTheme] = useState<PollTheme>({
    name: tenantName || '',
    logoInitials: logoInitials || 'HR',
    primaryColor: primaryColor || DEFAULT_PRIMARY,
    logoUrl: logoUrl ?? getTenantLogoUrl(tenantSlug),
  });

  useEffect(() => {
    if (!tenantSlug) {
      setTheme({
        name: tenantName || '',
        logoInitials: logoInitials || 'HR',
        primaryColor: primaryColor || DEFAULT_PRIMARY,
        logoUrl: logoUrl ?? null,
      });
      return;
    }

    let cancelled = false;
    api
      .pollGetMeta(tenantSlug)
      .then((meta) => {
        if (cancelled) return;
        setTheme({
          name: meta.name || tenantName || '',
          logoInitials: meta.logoInitials || logoInitials || 'HR',
          primaryColor: meta.primaryColor || primaryColor || DEFAULT_PRIMARY,
          logoUrl: meta.logoUrl || logoUrl || getTenantLogoUrl(tenantSlug),
        });
      })
      .catch(() => {
        if (cancelled) return;
        setTheme({
          name: tenantName || '',
          logoInitials: logoInitials || 'HR',
          primaryColor: primaryColor || DEFAULT_PRIMARY,
          logoUrl: logoUrl ?? getTenantLogoUrl(tenantSlug),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [tenantSlug, tenantName, primaryColor, logoInitials, logoUrl]);

  useEffect(() => {
    const root = document.documentElement;
    const prevPrimary = root.style.getPropertyValue('--primary');
    const prevTenant = root.style.getPropertyValue('--tenant-primary');
    root.style.setProperty('--primary', theme.primaryColor);
    root.style.setProperty('--tenant-primary', theme.primaryColor);
    return () => {
      if (prevPrimary) root.style.setProperty('--primary', prevPrimary);
      else root.style.removeProperty('--primary');
      if (prevTenant) root.style.setProperty('--tenant-primary', prevTenant);
      else root.style.removeProperty('--tenant-primary');
    };
  }, [theme.primaryColor]);

  const home = tenantSlug ? pollPath(tenantSlug) : '/poll';
  const displayName = theme.name || tenantName;
  const shellStyle = {
    '--primary': theme.primaryColor,
    '--tenant-primary': theme.primaryColor,
    '--poll-primary': theme.primaryColor,
  } as CSSProperties;

  return (
    <div className="poll-shell" style={shellStyle} data-tenant={tenantSlug || undefined}>
      <header className="poll-shell-header">
        <Link to={home} className={`poll-brand${theme.logoUrl ? ' poll-brand--logo' : ''}`}>
          {theme.logoUrl ? (
            <img
              className="poll-brand-logo"
              src={theme.logoUrl}
              alt={displayName ? `${displayName} logo` : 'Organization logo'}
            />
          ) : (
            <span className="poll-brand-mark" aria-hidden>
              {theme.logoInitials}
            </span>
          )}
          <div className="poll-brand-text">
            {!theme.logoUrl && <strong>{displayName ? `${displayName} Poll` : 'HarmiRecruit Poll'}</strong>}
            <span>{theme.logoUrl && displayName ? `${displayName} · ${subtitle}` : subtitle}</span>
          </div>
        </Link>
      </header>
      <main className="poll-shell-main">{children}</main>
    </div>
  );
}
