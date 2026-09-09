import { IconX } from './icons';

/** Full-page loading state for the careers pages. */
export function CareersPageLoader() {
  return (
    <div className="careers-shell" aria-busy="true" aria-label="Loading">
      <div className="careers-container" style={{ paddingTop: 40, display: 'grid', gap: 16 }}>
        <div className="careers-skeleton"><div className="careers-skeleton-line short" /><div className="careers-skeleton-line" style={{ height: 24 }} /><div className="careers-skeleton-line tiny" /></div>
        <div className="careers-skeleton"><div className="careers-skeleton-line short" /><div className="careers-skeleton-line tiny" /><div className="careers-skeleton-line" /></div>
        <div className="careers-skeleton"><div className="careers-skeleton-line short" /><div className="careers-skeleton-line tiny" /><div className="careers-skeleton-line" /></div>
      </div>
    </div>
  );
}

/** Full-page error state (e.g. tenant not found). */
export function CareersPageError({ title = 'Careers page not found', message = 'This careers page doesn’t exist or is no longer available.' }: { title?: string; message?: string }) {
  return (
    <div className="careers-shell">
      <div className="careers-container">
        <div className="careers-state" style={{ minHeight: '60vh' }}>
          <span className="careers-state-icon">
            <IconX />
          </span>
          <h3>{title}</h3>
          <p>{message}</p>
          <p className="careers-muted" style={{ fontSize: 13 }}>
            <a href="/" style={{ textDecoration: 'underline' }}>or return to the app home</a>
          </p>
        </div>
      </div>
    </div>
  );
}