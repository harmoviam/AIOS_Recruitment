import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useEffect } from 'react';
import { api } from '../../api/client';
import type { CareersTenant, PublicJob } from '../../types';
import '../../styles/careers.css';
import ApplicationWizard from '../../components/careers/ApplicationWizard';
import CareersFooter from '../../components/careers/CareersFooter';
import CareersNav from '../../components/careers/CareersNav';
import { CareersPageError } from '../../components/careers/CareerStates';
import {
  employmentType,
  formatExperience,
  formatOpenings,
  formatPosted,
  jobCity,
  parseSalary,
  workMode,
} from '../../components/careers/careers';
import { IconArrowRight, IconBriefcase, IconClock, IconCoins, IconOffice, IconPin } from '../../components/careers/icons';
import { usePageMeta } from '../../components/careers/usePageMeta';

/** Minimal inline formatter: **bold** and line/paragraph structure only. */
function renderDescription(text: string): ReactNode {
  const clean = text.replace(/\r/g, '');
  const blocks = clean.split(/\n{2,}/).filter((b) => b.trim());
  return (
    <div className="careers-prose">
      {blocks.map((block, bi) => {
        const lines = block.split('\n');
        const isList = lines.length > 1 && lines.every((l) => /^[-•*]\s+/.test(l.trim()));
        if (isList) {
          return (
            <ul key={bi}>
              {lines.map((l, i) => (
                <li key={i}>{inline(l.trim().replace(/^[-•*]\s+/, ''))}</li>
              ))}
            </ul>
          );
        }
        if (lines.length === 1 && /^[-•*]\s+/.test(lines[0].trim())) {
          return <p key={bi}>{inline(lines[0].trim().replace(/^[-•*]\s+/, ''))}</p>;
        }
        return <p key={bi}>{inline(lines.join(' '))}</p>;
      })}
    </div>
  );
}

function inline(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? <strong key={i}>{part.slice(2, -2)}</strong> : part
  );
}

interface Fact {
  dt: string;
  dd: ReactNode;
}

export default function CareersJobPage() {
  const { tenantSlug, jobId } = useParams();
  const [searchParams] = useSearchParams();
  const [tenant, setTenant] = useState<CareersTenant | null>(null);
  const [job, setJob] = useState<PublicJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [applyOpen, setApplyOpen] = useState(false);

  const load = useCallback(() => {
    if (!tenantSlug || !jobId) return;
    setLoading(true);
    setError(null);
    Promise.all([api.careersGetTenant(tenantSlug), api.careersGetJob(tenantSlug, Number(jobId))])
      .then(([t, j]) => {
        setTenant(t);
        setJob(j);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load this role.'))
      .finally(() => setLoading(false));
  }, [tenantSlug, jobId]);

  useEffect(() => {
    load();
    window.scrollTo(0, 0);
  }, [load]);

  const urlCity = searchParams.get('city') || undefined;
  const defaultCity = useMemo(() => urlCity || job?.city || undefined, [urlCity, job]);

  const facts: Fact[] = useMemo(() => {
    if (!job) return [];
    const salary = parseSalary(job.salary);
    const type = employmentType(job);
    const mode = workMode(job);
    const items: Fact[] = [];
    if (jobCity(job)) items.push({ dt: 'Location', dd: jobCity(job) });
    if (job.state) items.push({ dt: 'State', dd: job.state });
    if (salary.label) items.push({ dt: 'Salary', dd: salary.label });
    const exp = formatExperience(job.min_experience, job.max_experience);
    if (exp) items.push({ dt: 'Experience', dd: exp });
    if (type) items.push({ dt: 'Role type', dd: type });
    if (mode) items.push({ dt: 'Work mode', dd: mode });
    if (job.shift) items.push({ dt: 'Shift', dd: job.shift });
    if (job.industry) items.push({ dt: 'Industry', dd: job.industry });
    const openings = formatOpenings(job.open_positions);
    if (openings) items.push({ dt: 'Openings', dd: openings });
    items.push({ dt: 'Posted', dd: formatPosted(job.created_at) });
    return items;
  }, [job]);

  usePageMeta(
    job && tenant ? `${job.title} | ${tenant.name} Careers` : tenant ? `${tenant.name} Careers` : 'Careers',
    job && tenant
      ? `${job.title} at ${tenant.name}${jobCity(job) ? ` in ${jobCity(job)}` : ''}${parseSalary(job.salary).label ? ` · ${parseSalary(job.salary).label}` : ''}. Free to apply.`
      : undefined
  );

  if (loading) {
    return (
      <div className="careers-shell" >
        <div className="careers-container" style={{ paddingTop: 40, display: 'grid', gap: 16 }}>
          <div className="careers-skeleton"><div className="careers-skeleton-line short" /><div className="careers-skeleton-line" style={{ height: 30 }} /><div className="careers-skeleton-line tiny" /></div>
          <div className="careers-skeleton"><div className="careers-skeleton-line short" /><div className="careers-skeleton-line tiny" /></div>
        </div>
      </div>
    );
  }

  if (error || !tenant || !job) {
    return (
      <div className="careers-shell" >
        <CareersPageError title="Role not found" message={error || 'This position is no longer available.'} />
      </div>
    );
  }

  const skills = Array.isArray(job.required_skills) ? job.required_skills : [];
  const salaryLabel = parseSalary(job.salary).label;

  return (
    <div className="careers-shell careers-detail-page"  data-city={defaultCity || ''}>
      <div>
        <CareersNav tenant={tenant} page="job" onApply={() => setApplyOpen(true)} />

        <main className="careers-detail">
          <div className="careers-container">
            <Link className="careers-back" to={`/careers/${tenant.slug}`}>
              <IconArrowRight width={16} height={16} style={{ transform: 'rotate(180deg)' }} />
              All jobs at {tenant.name}
            </Link>

            <header className="careers-detail-hero">
              <div className="careers-detail-head">
                <div className="careers-detail-main">
                  <h1 className="careers-detail-title">{job.title}</h1>
                  {job.client && <div className="careers-detail-company">{job.client}</div>}
                  <div className="careers-detail-chips">
                    {jobCity(job) && (
                      <span className="careers-detail-chip">
                        <IconPin /> {jobCity(job)}
                      </span>
                    )}
                    {(employmentType(job) || workMode(job)) && (
                      <span className="careers-detail-chip">
                        <IconBriefcase /> {employmentType(job) || workMode(job)}
                      </span>
                    )}
                    {formatExperience(job.min_experience, job.max_experience) && (
                      <span className="careers-detail-chip">
                        <IconClock /> {formatExperience(job.min_experience, job.max_experience)}
                      </span>
                    )}
                    {salaryLabel && (
                      <span className="careers-detail-chip">
                        <IconCoins /> {salaryLabel}
                      </span>
                    )}
                    {job.open_positions > 1 && (
                      <span className="careers-detail-chip">
                        <IconOffice /> {job.open_positions} openings
                      </span>
                    )}
                    {job.shift && <span className="careers-detail-chip">{job.shift}</span>}
                  </div>
                </div>
              </div>
            </header>

            <div className="careers-detail-grid">
              <div className="careers-detail-body">
                {job.description?.trim() ? (
                  <section className="careers-detail-panel">
                    <h2>About the role</h2>
                    {renderDescription(job.description)}
                  </section>
                ) : null}

                {skills.length > 0 && (
                  <section className="careers-detail-panel">
                    <h2>Key skills</h2>
                    <div className="careers-job-skills">
                      {skills.map((s) => (
                        <span key={s} className="careers-skill-tag">{s}</span>
                      ))}
                    </div>
                  </section>
                )}

                {!job.description?.trim() && skills.length === 0 && (
                  <section className="careers-detail-panel">
                    <p className="careers-muted" style={{ margin: 0 }}>
                      Full details for this role are shared at the interview stage.
                    </p>
                  </section>
                )}
              </div>

              <aside className="careers-detail-aside">
                <div className="careers-apply-sticky">
                  <div className="careers-apply-card">
                    <h2 className="careers-apply-lead">Ready when you are.</h2>
                    <p className="careers-muted" style={{ fontSize: 14, margin: 0 }}>
                      Apply in about 2 minutes — free, and your details stay private until you submit.
                    </p>
                    <button
                      type="button"
                      className="careers-btn careers-btn-primary careers-btn-block"
                      onClick={() => setApplyOpen(true)}
                      data-action="apply-now"
                    >
                      Apply for this role
                    </button>
                    <p className="careers-apply-note">No account needed. Multiple formats welcome.</p>
                  </div>

                  <dl className="careers-quick-facts">
                    {facts.map((f) => (
                      <div key={String(f.dt)} className="careers-quick-fact">
                        <dt>{f.dt}</dt>
                        <dd>{f.dd}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </aside>
            </div>
          </div>
        </main>

        <div className="careers-mobile-cta">
          <button
            type="button"
            className="careers-btn careers-btn-primary"
            onClick={() => setApplyOpen(true)}
            data-action="apply-now"
          >
            Apply for this role
          </button>
        </div>
      </div>

      <CareersFooter tenant={tenant} onApply={() => setApplyOpen(true)} />

      {applyOpen && (
        <ApplicationWizard open={applyOpen} job={job} tenantSlug={tenant.slug} defaultCity={defaultCity} onClose={() => setApplyOpen(false)} />
      )}
    </div>
  );
}