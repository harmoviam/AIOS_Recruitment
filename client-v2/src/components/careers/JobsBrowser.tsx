import { useMemo, useState } from 'react';
import type { PublicJob } from '../../types';
import {
  activeFilterCount,
  EXPERIENCE_BUCKETS,
  filterJobs,
  hasSalaryData,
  POSTED_BUCKETS,
  SALARY_BUCKETS,
  sortJobs,
  type Filters,
  type SortKey,
} from './careers';
import JobCard from './JobCard';
import JobFilters, { type FilterCounts } from './JobFilters';
import { IconSearch, IconX } from './icons';

interface JobsBrowserProps {
  jobs: PublicJob[];
  tenantSlug: string;
  query: string;
  filters: Filters;
  counts: FilterCounts;
  sort: SortKey;
  onSort: (sort: SortKey) => void;
  onFilters: (filters: Filters) => void;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

const PAGE_SIZE = 6;

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'recent', label: 'Most recent' },
  { value: 'relevance', label: 'Most relevant' },
  { value: 'salary_high', label: 'Salary: high to low' },
  { value: 'salary_low', label: 'Salary: low to high' },
];

/** Live jobs section: filters (desktop sidebar + mobile sheet), sort, pagination. */
export default function JobsBrowser({
  jobs,
  tenantSlug,
  query,
  filters,
  counts,
  sort,
  onSort,
  onFilters,
  loading,
  error,
  onRetry,
}: JobsBrowserProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [visible, setVisible] = useState(PAGE_SIZE);

  const results = useMemo(() => {
    const filtered = filterJobs(jobs, filters, query);
    return sortJobs(filtered, sort, query);
  }, [jobs, filters, query, sort]);

  const shown = results.slice(0, visible);
  const filterCount = activeFilterCount(filters);
  const salarySortEnabled = hasSalaryData(jobs);

  const activeChips: { label: string; clear: () => void }[] = [];
  for (const city of filters.cities) activeChips.push({ label: `City: ${city}`, clear: () => onFilters({ ...filters, cities: filters.cities.filter((c) => c !== city) }) });
  for (const ind of filters.industries) activeChips.push({ label: ind, clear: () => onFilters({ ...filters, industries: filters.industries.filter((i) => i !== ind) }) });
  for (const s of filters.skills) activeChips.push({ label: `Skill: ${s}`, clear: () => onFilters({ ...filters, skills: filters.skills.filter((x) => x !== s) }) });
  for (const w of filters.workModes) activeChips.push({ label: w, clear: () => onFilters({ ...filters, workModes: filters.workModes.filter((x) => x !== w) }) });
  if (filters.experienceBucket) {
    const label = EXPERIENCE_BUCKETS.find((b) => b.value === filters.experienceBucket)?.label;
    activeChips.push({ label: `Exp: ${label}`, clear: () => onFilters({ ...filters, experienceBucket: '' }) });
  }
  if (filters.salaryBucket) {
    const label = SALARY_BUCKETS.find((b) => b.value === filters.salaryBucket)?.label;
    activeChips.push({ label: label ?? 'Salary', clear: () => onFilters({ ...filters, salaryBucket: '' }) });
  }
  if (filters.postedBucket) {
    const label = POSTED_BUCKETS.find((b) => b.value === filters.postedBucket)?.label;
    activeChips.push({ label: label ?? 'Posted', clear: () => onFilters({ ...filters, postedBucket: '' }) });
  }
  const clearAll = () =>
    onFilters({ ...filters, cities: [], industries: [], skills: [], workModes: [], employment: [], experienceBucket: '', salaryBucket: '', postedBucket: '' });

  const sortSelect = (s: SortKey) => {
    onSort(s);
    setVisible(PAGE_SIZE);
  };

  return (
    <section className="careers-section" id="careers-roles" aria-label="Open roles">
      <div className="careers-container">
        <div className="careers-jobs-head">
          <div>
            <span className="careers-eyebrow">Open roles</span>
            <h2 className="careers-jobs-title">
              {query ? <>Results for &ldquo;{query}&rdquo;</> : 'Latest opportunities'}
            </h2>
          </div>
          <span className="careers-jobs-count">
            {results.length} of {jobs.length} role{results.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="careers-jobs-toolbar">
          <button type="button" className="careers-filter-btn" onClick={() => setSheetOpen(true)} data-action="open-filters">
            Filters {filterCount > 0 && <span className="badge">{filterCount}</span>}
          </button>
          <label className="careers-sort">
            <span className="careers-muted" style={{ fontSize: 12.5, marginRight: 6, fontWeight: 600 }}>
              Sort
            </span>
            <select
              className="careers-sort-select"
              value={sort}
              onChange={(e) => sortSelect(e.target.value as SortKey)}
              aria-label="Sort roles"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value} disabled={opt.value.startsWith('salary') && !salarySortEnabled}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {activeChips.length > 0 && (
          <div className="careers-active-chips">
            {activeChips.map((chip, i) => (
              <span key={`${chip.label}-${i}`} className="careers-active-chip">
                {chip.label}
                <button type="button" aria-label={`Remove ${chip.label}`} onClick={chip.clear}>
                  <IconX width={12} height={12} />
                </button>
              </span>
            ))}
            <button type="button" className="careers-reset-filters" onClick={clearAll}>
              Clear all
            </button>
          </div>
        )}

        <div className="careers-jobs-layout">
          <aside className="careers-filters-panel" aria-label="Filter roles">
            <JobFilters filters={filters} counts={counts} onChange={(next) => { onFilters(next); setVisible(PAGE_SIZE); }} />
          </aside>

          <div className="careers-job-results">
            {loading ? (
              <>
                <div className="careers-skeleton"><div className="careers-skeleton-line short" /><div className="careers-skeleton-line tiny" /><div className="careers-skeleton-line" /></div>
                <div className="careers-skeleton"><div className="careers-skeleton-line short" /><div className="careers-skeleton-line tiny" /><div className="careers-skeleton-line" /></div>
                <div className="careers-skeleton"><div className="careers-skeleton-line short" /><div className="careers-skeleton-line tiny" /><div className="careers-skeleton-line" /></div>
              </>
            ) : error ? (
              <div className="careers-state">
                <span className="careers-state-icon">
                  <IconSearch />
                </span>
                <h3>We couldn&apos;t load the roles</h3>
                <p>{error}</p>
                <button type="button" className="careers-btn careers-btn-ghost" onClick={onRetry}>
                  Try again
                </button>
              </div>
            ) : shown.length === 0 ? (
              <div className="careers-state">
                <span className="careers-state-icon">
                  <IconSearch />
                </span>
                <h3>No roles match your search</h3>
                <p>
                  {query || activeChips.length
                    ? 'Try removing a filter or searching for a different skill or city.'
                    : 'New roles are posted regularly — check back soon.'}
                </p>
                {(query || activeChips.length > 0) && (
                  <button
                    type="button"
                    className="careers-btn careers-btn-primary"
                    onClick={clearAll}
                    data-action="clear-filters"
                  >
                    Clear search &amp; filters
                  </button>
                )}
              </div>
            ) : (
              shown.map((job) => <JobCard key={job.id} job={job} tenantSlug={tenantSlug} />)
            )}

            {!loading && !error && results.length > visible && (
              <div className="careers-load-more">
                <button
                  type="button"
                  className="careers-btn careers-btn-ghost"
                  onClick={() => setVisible((v) => v + PAGE_SIZE)}
                >
                  Load more roles ({results.length - visible} remaining)
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {sheetOpen && (
        <>
          <div className="careers-filters-scrim" onClick={() => setSheetOpen(false)} aria-hidden="true" />
          <div className="careers-filters-drawer" role="dialog" aria-modal="true" aria-label="Filter roles">
            <div className="careers-filters-drawer-head">
              <div>
                <h3 className="careers-wizard-title" style={{ marginBottom: 2 }}>Filter roles</h3>
                <div className="careers-wizard-sub">{results.length} matching role{results.length === 1 ? '' : 's'}</div>
              </div>
              <button type="button" className="careers-wizard-close" onClick={() => setSheetOpen(false)} aria-label="Close filters">
                <IconX />
              </button>
            </div>
            <div className="careers-filters-drawer-body">
              <JobFilters filters={filters} counts={counts} onChange={(next) => { onFilters(next); setVisible(PAGE_SIZE); }} />
            </div>
            <div className="careers-filters-drawer-foot">
              <button type="button" className="careers-btn careers-btn-ghost" onClick={clearAll}>
                Clear all
              </button>
              <button type="button" className="careers-btn careers-btn-primary careers-btn-block" onClick={() => setSheetOpen(false)}>
                Show {results.length} role{results.length === 1 ? '' : 's'}
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}