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

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading…</div>;
  if (error || !tenant || !job) {
    return (
      <div style={{ padding: '3rem 1rem', textAlign: 'center' }}>
        <h1>Job not found</h1>
        <p>{error || 'This position is no longer available.'}</p>
      </div>
    );
  }

  const brand = tenant.primary_color || '#2563EB';
  const input = {
    width: '100%', padding: '0.6rem 0.75rem', borderRadius: 8,
    border: '1px solid #d1d5db', fontSize: '0.95rem', boxSizing: 'border-box' as const,
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f4f6fb' }}>
      <header style={{ background: brand, color: '#fff', padding: '1.75rem 1.5rem' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <Link to={`/careers/${tenantSlug}`} style={{ color: '#fff', opacity: 0.85, textDecoration: 'none', fontSize: '0.85rem' }}>
            ← All jobs at {tenant.name}
          </Link>
          <h1 style={{ margin: '0.5rem 0 0', fontSize: '1.6rem' }}>{job.title}</h1>
          <p style={{ margin: '0.35rem 0 0', opacity: 0.9 }}>📍 {job.location}</p>
        </div>
      </header>

      <main style={{ maxWidth: 760, margin: '0 auto', padding: '2rem 1rem', display: 'grid', gap: '1.25rem' }}>
        {job.description && (
          <section style={{ background: '#fff', borderRadius: 12, padding: '1.5rem', border: '1px solid #e6e9f0' }}>
            <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>About this role</h2>
            <div style={{ whiteSpace: 'pre-wrap', color: '#374151', lineHeight: 1.65, fontSize: '0.95rem' }}>
              {job.description}
            </div>
          </section>
        )}

        <section style={{ background: '#fff', borderRadius: 12, padding: '1.5rem', border: '1px solid #e6e9f0' }}>
          {applied ? (
            <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
              <div style={{ fontSize: '2.5rem' }}>🎉</div>
              <h2 style={{ margin: '0.5rem 0' }}>Application received!</h2>
              <p style={{ color: '#6b7280' }}>
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
                {/* Honeypot — humans never see it, bots fill it */}
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
                    background: brand, color: '#fff', border: 0, borderRadius: 999,
                    padding: '0.75rem 1.5rem', fontSize: '1rem', fontWeight: 600,
                    cursor: submitting ? 'wait' : 'pointer',
                  }}
                >
                  {submitting ? 'Submitting…' : 'Submit application'}
                </button>
              </div>
            </form>
          )}
        </section>

        <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: '0.8rem' }}>Powered by HarmiRecruit</p>
      </main>
    </div>
  );
}
