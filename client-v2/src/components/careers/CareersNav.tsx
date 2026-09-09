import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { CareersTenant } from '../../types';
import { IconMenu, IconX } from './icons';

interface CareersNavProps {
  tenant: CareersTenant;
  page?: 'landing' | 'job';
  openings?: number;
  onApply?: () => void;
}

function initialsOf(tenant: CareersTenant): string {
  if (tenant.logo_initials) return tenant.logo_initials;
  return tenant.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('') || tenant.name.slice(0, 2).toUpperCase();
}

/** Sticky nav with logo, anchor links, Apply CTA and mobile drawer. */
export default function CareersNav({ tenant, page = 'landing', openings, onApply }: CareersNavProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const base = `/careers/${tenant.slug}`;
  const links =
    page === 'landing'
      ? [
          { href: '#careers-roles', label: 'Browse roles' },
          { href: '#careers-cities', label: 'Jobs by city' },
          { href: '#careers-about', label: 'About' },
          { href: '#careers-faq', label: 'FAQ' },
        ]
      : [{ href: base, label: 'Browse all roles' }];

  const applyLabel = openings ? `Apply now · ${openings} ${openings === 1 ? 'role' : 'roles'}` : 'Apply now';

  return (
    <header className="careers-nav">
      <div className="careers-container careers-nav-inner">
        <Link className="careers-brand" to={base} aria-label={`${tenant.name} careers home`}>
          <span className="careers-brand-logo">{initialsOf(tenant)}</span>
          <span className="careers-brand-text">
            <span className="careers-brand-name">{tenant.name}</span>
            <span className="careers-brand-tag">Careers</span>
          </span>
        </Link>

        <nav className="careers-nav-links" aria-label="Careers navigation">
          {links.map((l) =>
            l.href.startsWith('#') ? (
              <a key={l.label} href={l.href}>
                {l.label}
              </a>
            ) : (
              <Link key={l.label} to={l.href}>
                {l.label}
              </Link>
            )
          )}
        </nav>

        <button
          type="button"
          className="careers-btn careers-btn-primary careers-nav-cta"
          onClick={onApply}
          data-action="apply-now"
        >
          {applyLabel}
        </button>

        <button
          type="button"
          className="careers-hamburger"
          aria-expanded={open}
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <IconX /> : <IconMenu />}
        </button>
      </div>

      {open && (
        <div className="careers-drawer">
          {links.map((l) =>
            l.href.startsWith('#') ? (
              <a key={l.label} href={l.href} onClick={() => setOpen(false)}>
                {l.label}
              </a>
            ) : (
              <Link key={l.label} to={l.href} onClick={() => setOpen(false)}>
                {l.label}
              </Link>
            )
          )}
          <button
            type="button"
            className="careers-btn careers-btn-primary"
            onClick={() => {
              setOpen(false);
              onApply?.();
            }}
          >
            {applyLabel}
          </button>
        </div>
      )}
    </header>
  );
}