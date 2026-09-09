import { useMemo } from 'react';
import { canonicalCity, POPULAR_CITIES } from './careers';
import type { CityOption } from './careers';
import { IconChevronDown, IconPin } from './icons';

interface CitySectionProps {
  selectedCity: string | null;
  metaCounts: Record<string, number>;
  onPickCity: (city: string | null) => void;
}

interface CityRow extends CityOption {
  count: number | null;
  isLive: boolean;
}

/** City picker + "Jobs by city" grid driven by live API counts. */
export default function CitySection({ selectedCity, metaCounts, onPickCity }: CitySectionProps) {
  const rows: CityRow[] = useMemo(() => {
    const known = new Map<string, CityRow>();
    for (const c of POPULAR_CITIES) {
      const key = canonicalCity(c.city);
      known.set(key, { city: c.city, state: c.state, count: metaCounts[key] ?? null, isLive: metaCounts[key] != null });
    }
    // Surface backend cities missing from the curated catalogue.
    for (const [city, count] of Object.entries(metaCounts)) {
      if (count <= 0) continue;
      const key = canonicalCity(city);
      if (!key || known.has(key)) continue;
      if (city.toLowerCase().includes('remote') || city.toLowerCase().includes('work from home')) continue;
      known.set(key, { city, state: '', count, isLive: true });
    }
    const list = [...known.values()];
    const withJobs = list.filter((r) => r.isLive).sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
    const rest = list.filter((r) => !r.isLive);
    return [...withJobs, ...rest];
  }, [metaCounts]);

  const liveTotal = useMemo(() => rows.filter((r) => r.isLive).reduce((sum, r) => sum + (r.count ?? 0), 0), [rows]);

  return (
    <section className="careers-section" id="careers-cities" aria-label="Jobs by city">
      <div className="careers-city-divider">
        Or pick a place, we&apos;ll handle the rest
      </div>

      <div className="careers-section-head">
        <div>
          <span className="careers-eyebrow">By city</span>
          <h2 className="careers-title-lg">Explore jobs by city</h2>
        </div>
        {liveTotal > 0 && <span className="careers-jobs-count">{liveTotal} live roles across India</span>}
      </div>

      <div className="careers-city-grid">
        {rows.map((row) => (
          <button
            key={row.city}
            type="button"
            className="careers-city-card"
            aria-pressed={selectedCity === row.city}
            onClick={() => onPickCity(selectedCity === row.city ? null : row.city)}
          >
            <span>
              <span className="careers-city-name">{row.city}</span>
              {row.state && <span className="careers-city-state"> · {row.state}</span>}
              {!row.state && <span className="careers-city-state"></span>}
            </span>
            {row.count != null ? (
              <span className="careers-city-count">
                {row.count} {row.count === 1 ? 'role' : 'roles'}
              </span>
            ) : (
              <span className="careers-city-count" style={{ background: 'transparent', color: 'var(--c-muted)', paddingRight: 0 }}>
                Explore
              </span>
            )}
          </button>
        ))}
      </div>

      <details className="careers-cities-more" style={{ marginTop: 14 }}>
        <summary style={{ cursor: 'pointer', listStyle: 'none' }} className="careers-chip">
          <IconChevronDown width={14} height={14} /> More cities
        </summary>
        <p className="careers-muted" style={{ fontSize: 13, padding: '8px 4px 0' }}>
          Can&apos;t find your city? Use the search box above — we work with opportunities across every state. You can
          also open a <a href="#careers-roles" onClick={(e) => e.preventDefault()}>role</a> and apply from anywhere.
        </p>
      </details>

      {selectedCity && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
          <IconPin width={16} height={16} style={{ color: 'var(--c-primary-strong)' }} />
          <button
            type="button"
            className="careers-chip"
            onClick={() => onPickCity(null)}
            style={{ borderColor: 'var(--c-primary)' }}
          >
            Showing jobs in <strong>{selectedCity}</strong> — clear
          </button>
        </div>
      )}
    </section>
  );
}