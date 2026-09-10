import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import type { CareersMeta, CareersTenant, PublicJob } from '../../types';
import ApplicationWizard from '../../components/careers/ApplicationWizard';
import CareersFooter from '../../components/careers/CareersFooter';
import CareersNav from '../../components/careers/CareersNav';
import { CareersPageError } from '../../components/careers/CareerStates';
import CitySection from '../../components/careers/CitySection';
import FaqSection from '../../components/careers/FaqSection';
import HeroSearch from '../../components/careers/HeroSearch';
import JobsBrowser from '../../components/careers/JobsBrowser';
import type { FilterCounts } from '../../components/careers/JobFilters';
import TrustSection, { HowItWorks } from '../../components/careers/TrustSection';
import {
  EMPTY_FILTERS,
  employmentType,
  jobCity,
  parseParamList,
  workMode,
  type Filters,
  type SortKey,
} from '../../components/careers/careers';
import { usePageMeta } from '../../components/careers/usePageMeta';
import '../../styles/careers.css';

function initialFiltersFromParams(params: URLSearchParams): Filters {
  const cities = parseParamList(params.get('city')).slice(0, 3);
  const skills = parseParamList(params.get('skills')).slice(0, 5);
  return { ...EMPTY_FILTERS, cities, skills };
}

export default function CareersPage() {
  const { tenantSlug } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const [tenant, setTenant] = useState<CareersTenant | null>(null);
  const [jobs, setJobs] = useState<PublicJob[]>([]);
  const [meta, setMeta] = useState<CareersMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState(() => searchParams.get('q') || '');
  const [filters, setFilters] = useState<Filters>(() => initialFiltersFromParams(searchParams));
  const [sort, setSort] = useState<SortKey>('recent');
  const [wizardCity, setWizardCity] = useState<string | null>(null);
  const [applyOpen, setApplyOpen] = useState(false);

  const load = useCallback(() => {
    if (!tenantSlug) return;
    setLoading(true);
    setError(null);
    Promise.all([api.careersGetTenant(tenantSlug), api.careersGetJobs(tenantSlug), api.careersGetMeta(tenantSlug).catch(() => null)])
      .then(([t, j, m]) => {
        setTenant(t);
        setJobs(j);
        setMeta(m);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load careers page.'))
      .finally(() => setLoading(false));
  }, [tenantSlug]);

  useEffect(() => {
    load();
    window.scrollTo(0, 0);
  }, [load]);

  // Keep ?city= and ?q= in sync with state for shareable URLs.
  const syncParams = useCallback(
    (nextQuery: string, nextFilters: Filters) => {
      const params = new URLSearchParams();
      if (nextQuery) params.set('q', nextQuery);
      if (nextFilters.cities.length) params.set('city', nextFilters.cities.join(','));
      if (nextFilters.skills.length) params.set('skills', nextFilters.skills.join(','));
      setSearchParams(params, { replace: true });
    },
    [setSearchParams]
  );

  const handleSearch = useCallback(
    (q: string) => {
      setQuery(q);
      syncParams(q, filters);
      document.getElementById('careers-roles')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    [filters, syncParams]
  );

  const handleFilters = useCallback(
    (next: Filters) => {
      setFilters(next);
      syncParams(query, next);
    },
    [query, syncParams]
  );

  const handlePickCity = useCallback(
    (city: string | null) => {
      const cities = city ? [city] : [];
      const next = { ...filters, cities };
      setFilters(next);
      syncParams(query, next);
      document.getElementById('careers-roles')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.setTimeout(() => {
        document.getElementById('careers-roles')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
    },
    [filters, query, syncParams]
  );

  const openApply = useCallback(() => {
    setWizardCity(filters.cities[0] ?? null);
    setApplyOpen(true);
  }, [filters.cities]);

  // Filter counts for the sidebar / sheet, derived from all live jobs.
  const counts = useMemo<FilterCounts>(() => {
    const c: FilterCounts = { cities: {}, industries: {}, skills: {}, employment: {}, workModes: {} };
    for (const job of jobs) {
      const city = jobCity(job);
      if (city) c.cities[city] = (c.cities[city] ?? 0) + 1;
      const industry = String(job.industry ?? '').trim();
      if (industry) c.industries[industry] = (c.industries[industry] ?? 0) + 1;
      for (const s of Array.isArray(job.required_skills) ? job.required_skills : []) {
        c.skills[s] = (c.skills[s] ?? 0) + 1;
      }
      const type = employmentType(job);
      if (type) c.employment[type] = (c.employment[type] ?? 0) + 1;
      const mode = workMode(job);
      if (mode) c.workModes[mode] = (c.workModes[mode] ?? 0) + 1;
    }
    return c;
  }, [jobs]);

  const suggestions = useMemo(() => {
    const set = new Set<string>();
    for (const job of jobs) {
      set.add(job.title);
      if (job.industry) set.add(job.industry);
      for (const s of Array.isArray(job.required_skills) ? job.required_skills : []) set.add(s);
    }
    return [...set].slice(0, 14);
  }, [jobs]);

  const popularChips = useMemo(() => {
    const skills = Object.entries(counts.skills).sort((a, b) => b[1] - a[1]).map(([s]) => s);
    return skills.slice(0, 3).concat(jobs.slice(0, 2).map((j) => j.title)).slice(0, 5);
  }, [jobs, counts]);

  const metaTotal = meta?.total ?? jobs.length;
  const liveCities = new Set(meta?.cities?.map((c) => c.city) ?? []).size;
  const cityCount = Math.max(liveCities, meta?.cities?.length ?? 0);

  usePageMeta(
    tenant ? `${tenant.name} Careers | Find your next role` : 'Careers',
    tenant
      ? `${tenant.name} — ${metaTotal} verified open role${metaTotal === 1 ? '' : 's'} across India. Free to apply, direct recruiter contact.`
      : undefined,
    {
      canonicalUrl: tenant ? `${typeof window !== 'undefined' ? window.location.origin : ''}/careers/${tenant.slug}` : undefined,
      jsonLd: tenant && jobs.length > 0
        ? {
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            itemListElement: jobs.slice(0, 10).map((job, i) => ({
              '@type': 'ListItem',
              position: i + 1,
              url: `${typeof window !== 'undefined' ? window.location.origin : ''}/careers/${tenant.slug}/jobs/${job.id}`,
              name: job.title,
            })),
          }
        : undefined,
    }
  );

  if (loading) {
    return (
      <div className="careers-shell"  aria-busy="true">
        <div className="careers-container" style={{ paddingTop: 48, display: 'grid', gap: 16 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="careers-skeleton">
              <div className="careers-skeleton-line short" />
              <div className="careers-skeleton-line tiny" />
              <div className="careers-skeleton-line" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || !tenant) {
    return <CareersPageError title="Careers page not found" message={error || undefined} />;
  }

  return (
    <div className="careers-shell" >
      <CareersNav tenant={tenant} openings={metaTotal > 0 ? metaTotal : undefined} onApply={openApply} />

      <main>
        <HeroSearch
          tenantName={tenant.name}
          roleCount={metaTotal}
          cityCount={cityCount}
          suggestions={suggestions}
          popularChips={popularChips}
          onSearch={handleSearch}
        />

        <div className="careers-container">
          <CitySection selectedCity={filters.cities[0] ?? null} metaCounts={metaCountMap(meta)} onPickCity={handlePickCity} />
        </div>

        <JobsBrowser
          jobs={jobs}
          tenantSlug={tenant.slug}
          query={query}
          filters={filters}
          counts={counts}
          sort={sort}
          onSort={setSort}
          onFilters={handleFilters}
          loading={false}
          error={null}
          onRetry={load}
        />

        <div className="careers-container">
          <HowItWorks />
          <TrustSection stats={trustStats(metaTotal, cityCount)} />
          <FaqSection />
        </div>
      </main>

      <CareersFooter tenant={tenant} onApply={openApply} />

      {applyOpen && tenant && jobs[0] && (
        <ApplicationWizard open={applyOpen} job={wizardTarget(jobs, wizardCity) ?? jobs[0]} tenantSlug={tenant.slug} defaultCity={wizardCity ?? filters.cities[0]} onClose={() => setApplyOpen(false)} />
      )}
    </div>
  );
}

function metaCountMap(meta: CareersMeta | null): Record<string, number> {
  const map: Record<string, number> = {};
  for (const c of meta?.cities ?? []) {
    map[c.city] = c.count;
  }
  return map;
}

function trustStats(total: number, cities: number) {
  return [
    { num: String(total), label: 'Verified open role' + (total === 1 ? '' : 's') + ' right now' },
    { num: String(cities), label: 'Indian cities to explore' },
    { num: '₹0', label: 'Cost to you — always' },
    { num: 'Fast', label: 'Screened by real recruiters' },
  ];
}

// Wizard applies to the first job (highest visibility) when opened from the nav/footer.
function wizardTarget(jobs: PublicJob[], city: string | null): PublicJob | null {
  if (!jobs.length) return null;
  if (city) {
    const match = jobs.find((j) => jobCity(j) === city);
    if (match) return match;
  }
  return jobs[0];
}