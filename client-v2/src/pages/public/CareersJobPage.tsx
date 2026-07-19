import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { mixWithWhite, withAlpha } from '../../lib/brandColor';
import type { CareersTenant, PublicJob } from '../../types';

export default function CareersJobPage() {
  const { tenantSlug, jobId } = useParams();
  const [tenant, setTenant] = useState<CareersTenant | null>(null);
  const [job, setJob] = useState<PublicJob | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [resume, setResume] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [applied, setApplied] = useState(false);
  const [applyError, setApplyError] = useState('');

  useEffect(() => {
    if (!tenantSlug || !jobId) return;
    Promise.all([api.careersGetTenant(tenantSlug), api.careersGetJob(tenantSlug, Number(jobId))])
      .then(([t, j]) => {
        setTenant(t);
        setJob(j);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [tenantSlug, jobId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantSlug || !jobId) return;
    setApplyError('');
    setSubmitting(true);
    try {
      await api.careersApply(tenantSlug, Number(jobId), { name, email, phone, resume });
      setApplied(true);
    } catch (err) {
      setApplyError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>Loading…</div>
    );
  }
  if (error || !tenant || !job) {
    return (
      <div style={{ padding: '3rem 1rem', textAlign: 'center' }}>
        <h1>Job not found</h1>
        <p style={{ color: '#6b7280' }}>{error || 'This position is no longer available.'}</p>
      </div>
    );
  }

  const brand = tenant.primary_color || '#2563EB';
  const wash = mixWithWhite(brand, 0.92);
  const soft = mixWithWhite(brand, 0.85);
  const input = {
    width: '100%',
    padding: '0.7rem 0.85rem',
    borderRadius: 10,
    border: `1px solid ${soft}`,
    fontSize: '0.95rem',
    boxSizing: 'border-box' as const,
    background: '#fff',
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: `radial-gradient(900px 420px at 20% -5%, ${withAlpha(brand, 0.22)}, transparent 55%), linear-gradient(180deg, ${wash} 0%, #f8fafc 40%, #f8fafc 100%)`,
        fontFamily: '"Source Sans 3", "Segoe UI", sans-serif',
        color: '#0f172a',
      }}
    >
      <header
        style={{
          background: `linear-gradient(160deg, ${brand} 0%, ${mixWithWhite(brand, 0.18)} 100%)`,
          color: '#fff',
          padding: '1.75rem 1.5rem 2rem',
        }}
      >
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <Link
            to={`/careers/${tenantSlug}`}
            style={{ color: '#fff', opacity: 0.9, textDecoration: 'none', fontSize: '0.88rem', display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}
          >
            {tenant.logo_url ? (
              <img
                src={tenant.logo_url}
                alt=""
                width={28}
                height={28}
                style={{ width: 28, height: 28, objectFit: 'contain', borderRadius: 8, background: '#fff', padding: 3 }}
              />
            ) : null}
            ← All jobs at {tenant.name}
          </Link>
          <h1
            style={{
              margin: '0.85rem 0 0',
              fontSize: 'clamp(1.5rem, 3.5vw, 2rem)',
              fontFamily: '"Fraunces", Georgia, serif',
              fontWeight: 600,
              letterSpacing: '-0.02em',
            }}
          >
            {job.title}
          </h1>
          <p style={{ margin: '0.4rem 0 0', opacity: 0.92 }}>{job.location}</p>
        </div>
      </header>

      <main style={{ maxWidth: 760, margin: '0 auto', padding: '2rem 1rem 3rem', display: 'grid', gap: '1.25rem' }}>
        {job.description && (
          <section>
            <h2 style={{ marginTop: 0, fontSize: '1.05rem', color: brand }}>About this role</h2>
            <div style={{ whiteSpace: 'pre-wrap', color: '#334155', lineHeight: 1.7, fontSize: '0.97rem' }}>
              {job.description}
            </div>
          </section>
        )}

        <section
          style={{
            background: '#fff',
            borderRadius: 16,
            padding: '1.5rem',
            border: `1px solid ${soft}`,
            boxShadow: `0 10px 30px ${withAlpha(brand, 0.08)}`,
          }}
        >
          {applied ? (
            <div style={{ textAlign: 'center', padding: '1.25rem 0' }}>
              <h2 style={{ margin: '0.25rem 0', fontFamily: '"Fraunces", Georgia, serif' }}>Application received</h2>
              <p style={{ color: '#64748b', lineHeight: 1.55 }}>
                Thanks {name.split(' ')[0]} — the {tenant.name} recruitment team will review your profile and get in touch.
              </p>
            </div>
          ) : (
            <form onSubmit={submit}>
              <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Apply for this position</h2>
              {applyError && (
                <div style={{ background: '#fef2f2', color: '#b91c1c', borderRadius: 8, padding: '0.6rem 0.9rem', marginBottom: '1rem', fontSize: '0.9rem' }}>
                  {applyError}
                </div>
              )}
              <div style={{ display: 'grid', gap: '0.9rem' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.3rem' }}>Full name *</label>
                  <input style={input} value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.3rem' }}>Phone *</label>
                  <input style={input} value={phone} onChange={(e) => setPhone(e.target.value)} required placeholder="+91" />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.3rem' }}>Email</label>
                  <input style={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.3rem' }}>
                    Resume (PDF or Word)
                  </label>
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx"
                    onChange={(e) => setResume(e.target.files?.[0] || null)}
                  />
                </div>
                <input
                  type="text"
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                  style={{ position: 'absolute', left: '-9999px', height: 0, width: 0, border: 0, padding: 0 }}
                  aria-hidden="true"
                />
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    background: brand,
                    color: '#fff',
                    border: 0,
                    borderRadius: 999,
                    padding: '0.8rem 1.5rem',
                    fontSize: '1rem',
                    fontWeight: 600,
                    cursor: submitting ? 'wait' : 'pointer',
                  }}
                >
                  {submitting ? 'Submitting…' : 'Submit application'}
                </button>
              </div>
            </form>
          )}
        </section>

        <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.78rem' }}>Powered by HarmiRecruit</p>
      </main>
    </div>
  );
}
