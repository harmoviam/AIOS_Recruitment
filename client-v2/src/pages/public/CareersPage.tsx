import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import type { PublicJob } from '../../types';

interface CareersTenant {
  slug: string;
  name: string;
  primary_color: string;
  logo_initials: string;
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

  if (loading) return <div className="careers-shell"><p>Loading…</p></div>;
  if (error || !tenant) {
    return (
      <div className="careers-shell">
        <div className="careers-card">
          <h1>Careers page not found</h1>
          <p>{error || 'This careers page does not exist or is no longer available.'}</p>
        </div>
      </div>
    );
  }

  const brand = tenant.primary_color || '#2563EB';

  return (
    <div className="careers-shell" style={{ minHeight: '100vh', background: '#f4f6fb' }}>
      <header style={{ background: brand, color: '#fff', padding: '2.5rem 1.5rem', textAlign: 'center' }}>
        <div
          style={{
            width: 56, height: 56, borderRadius: 12, background: 'rgba(255,255,255,0.2)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.75rem',
          }}
        >
          {tenant.logo_initials}
        </div>
        <h1 style={{ margin: 0, fontSize: '1.75rem' }}>Careers at {tenant.name}</h1>
        <p style={{ opacity: 0.9, marginTop: '0.5rem' }}>
          {jobs.length} open position{jobs.length === 1 ? '' : 's'}
        </p>
      </header>

      <main style={{ maxWidth: 760, margin: '0 auto', padding: '2rem 1rem' }}>
        {jobs.length === 0 ? (
          <div className="careers-card" style={{ background: '#fff', borderRadius: 12, padding: '2rem', textAlign: 'center' }}>
            <p>No open positions right now. Check back soon!</p>
          </div>
        ) : (
          jobs.map((job) => (
            <Link
              key={job.id}
              to={`/careers/${tenantSlug}/jobs/${job.id}`}
              style={{
                display: 'block', background: '#fff', borderRadius: 12, padding: '1.25rem 1.5rem',
                marginBottom: '1rem', textDecoration: 'none', color: '#1f2937',
                border: '1px solid #e6e9f0',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.1rem' }}>{job.title}</h2>
                  <p style={{ margin: '0.35rem 0 0', color: '#6b7280', fontSize: '0.9rem' }}>
                    📍 {job.location}
                    {job.open_positions > 1 ? ` · ${job.open_positions} openings` : ''}
                  </p>
                </div>
                <span
                  style={{
                    background: brand, color: '#fff', borderRadius: 999,
                    padding: '0.45rem 1.1rem', fontSize: '0.85rem', fontWeight: 600,
                  }}
                >
                  View & apply →
                </span>
              </div>
            </Link>
          ))
        )}
        <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: '0.8rem', marginTop: '2rem' }}>
          Powered by HarmiRecruit
        </p>
      </main>
    </div>
  );
}
