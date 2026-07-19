import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { mixWithWhite, withAlpha } from '../../lib/brandColor';
import type { CareersTenant, PublicJob } from '../../types';

function BrandMark({ tenant, size = 72 }: { tenant: CareersTenant; size?: number }) {
  const brand = tenant.primary_color || '#2563EB';
  if (tenant.logo_url) {
    return (
      <img
        src={tenant.logo_url}
        alt={`${tenant.name} logo`}
        width={size}
        height={size}
        style={{
          width: size,
          height: size,
          objectFit: 'contain',
          borderRadius: 16,
          background: '#fff',
          padding: 10,
          boxShadow: `0 12px 32px ${withAlpha(brand, 0.22)}`,
        }}
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 16,
        background: 'rgba(255,255,255,0.18)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.32,
        fontWeight: 700,
        letterSpacing: '0.04em',
      }}
    >
      {tenant.logo_initials}
    </div>
  );
}

export default function CareersPage() {
  const { tenantSlug } = useParams();
  const [tenant, setTenant] = useState<CareersTenant | null>(null);
  const [jobs, setJobs] = useState<PublicJob[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantSlug) return;
    Promise.all([api.careersGetTenant(tenantSlug), api.careersGetJobs(tenantSlug)])
      .then(([t, j]) => {
        setTenant(t);
        setJobs(j);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [tenantSlug]);

  if (loading) {
    return (
      <div className="careers-shell" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <p>Loading…</p>
      </div>
    );
  }
  if (error || !tenant) {
    return (
      <div className="careers-shell" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '2rem' }}>
        <div style={{ textAlign: 'center', maxWidth: 420 }}>
          <h1 style={{ marginTop: 0 }}>Careers page not found</h1>
          <p style={{ color: '#6b7280' }}>{error || 'This careers page does not exist or is no longer available.'}</p>
        </div>
      </div>
    );
  }

  const brand = tenant.primary_color || '#2563EB';
  const wash = mixWithWhite(brand, 0.92);
  const soft = mixWithWhite(brand, 0.85);

  return (
    <div
      className="careers-shell"
      style={{
        minHeight: '100vh',
        background: `radial-gradient(1200px 520px at 50% -10%, ${withAlpha(brand, 0.28)}, transparent 60%), linear-gradient(180deg, ${wash} 0%, #f8fafc 42%, #f8fafc 100%)`,
        color: '#0f172a',
        fontFamily: '"Source Sans 3", "Segoe UI", sans-serif',
      }}
    >
      <header
        style={{
          padding: '3.5rem 1.5rem 2.75rem',
          textAlign: 'center',
          background: `linear-gradient(160deg, ${brand} 0%, ${mixWithWhite(brand, 0.18)} 100%)`,
          color: '#fff',
        }}
      >
        <div style={{ marginBottom: '1.1rem' }}>
          <BrandMark tenant={tenant} />
        </div>
        <p
          style={{
            margin: 0,
            fontSize: '0.8rem',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            opacity: 0.85,
            fontWeight: 600,
          }}
        >
          {tenant.name}
        </p>
        <h1
          style={{
            margin: '0.55rem 0 0',
            fontSize: 'clamp(1.8rem, 4vw, 2.4rem)',
            fontFamily: '"Fraunces", Georgia, serif',
            fontWeight: 600,
            letterSpacing: '-0.02em',
          }}
        >
          Join the team
        </h1>
        <p style={{ opacity: 0.92, margin: '0.65rem auto 0', maxWidth: 420, lineHeight: 1.5 }}>
          {jobs.length === 0
            ? 'No open roles right now — check back soon.'
            : `${jobs.length} open position${jobs.length === 1 ? '' : 's'} waiting for the right person.`}
        </p>
      </header>

      <main style={{ maxWidth: 760, margin: '0 auto', padding: '2rem 1rem 3rem' }}>
        {jobs.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#64748b', padding: '2rem 0' }}>
            We’re not hiring at the moment. Follow up later for new openings.
          </p>
        ) : (
          jobs.map((job) => (
            <Link
              key={job.id}
              to={`/careers/${tenantSlug}/jobs/${job.id}`}
              style={{
                display: 'block',
                background: '#fff',
                borderRadius: 14,
                padding: '1.25rem 1.5rem',
                marginBottom: '0.85rem',
                textDecoration: 'none',
                color: '#0f172a',
                border: `1px solid ${soft}`,
                boxShadow: `0 1px 0 ${withAlpha(brand, 0.06)}`,
                transition: 'transform 160ms ease, box-shadow 160ms ease',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.12rem', fontWeight: 600 }}>{job.title}</h2>
                  <p style={{ margin: '0.4rem 0 0', color: '#64748b', fontSize: '0.92rem' }}>
                    {job.location}
                    {job.open_positions > 1 ? ` · ${job.open_positions} openings` : ''}
                  </p>
                </div>
                <span
                  style={{
                    background: brand,
                    color: '#fff',
                    borderRadius: 999,
                    padding: '0.5rem 1.15rem',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                  }}
                >
                  View & apply
                </span>
              </div>
            </Link>
          ))
        )}
        <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.78rem', marginTop: '2.5rem' }}>
          Powered by HarmiRecruit
        </p>
      </main>
    </div>
  );
}
