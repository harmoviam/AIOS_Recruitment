import type { CareersTenant } from '../../types';

interface CareersFooterProps {
  tenant: CareersTenant;
  onApply?: () => void;
}

function initialsOf(tenant: CareersTenant): string {
  if (tenant.logo_initials) return tenant.logo_initials;
  return (
    tenant.name
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() || '')
      .join('') || tenant.name.slice(0, 2).toUpperCase()
  );
}

/** Footer with brand, quick links and a final apply CTA. */
export default function CareersFooter({ tenant, onApply }: CareersFooterProps) {
  const year = new Date().getFullYear();
  return (
    <footer className="careers-footer">
      <div className="careers-container">
        <div className="careers-footer-top">
          <div className="careers-footer-brand">
            <span className="careers-brand">
              <span className="careers-brand-logo">{initialsOf(tenant)}</span>
              <span className="careers-brand-text">
                <span className="careers-brand-name">{tenant.name}</span>
              <span className="careers-brand-tag" style={{ color: 'rgba(236,238,254,.55)' }}>
                Careers
              </span>
            </span>
          </span>
          <p className="careers-muted" style={{ color: 'rgba(236,238,254,.6)', fontSize: 13.5, marginTop: 12, maxWidth: 300 }}>
            Verified roles, fast applications and direct recruiter contact — free for every applicant.
          </p>
        </div>
          <nav aria-label="Footer">
            <h4>Explore</h4>
            <ul>
              <li><a href="#careers-roles">Browse open roles</a></li>
              <li><a href="#careers-cities">Jobs by city</a></li>
              <li><a href="#careers-about">Why apply here</a></li>
              <li><a href="#careers-faq">FAQ</a></li>
            </ul>
          </nav>
          <div>
            <h4>You’re one step away</h4>
            <button type="button" className="careers-btn careers-btn-gold" onClick={onApply} data-action="apply-now">
              Apply now
            </button>
          </div>
        </div>
        <div className="careers-footer-bottom">
          <span>© {year} {tenant.name}. All rights reserved.</span>
          <span>Made for job seekers, with care.</span>
        </div>
      </div>
    </footer>
  );
}