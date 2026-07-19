import { PDL_SENIORITY_LEVELS, type PeopleSearchFilters } from '../../../types/sourcing.js';

const ABSOLUTE_MAX_RESULTS = 25;
const DEFAULT_RESULTS = 5;

function envMaxResults(): number {
  const n = Number(process.env.PDL_MAX_RESULTS);
  return Number.isFinite(n) && n > 0 ? n : 10;
}

/** Every returned PDL record costs one credit, so size stays code-controlled. */
export function clampSize(requested?: number): number {
  const size = Math.floor(requested ?? DEFAULT_RESULTS);
  return Math.max(1, Math.min(size, envMaxResults(), ABSOLUTE_MAX_RESULTS));
}

export function sanitizeSeniorityLevels(levels?: string[]): string[] {
  if (!levels?.length) return [];
  const allowed = new Set<string>(PDL_SENIORITY_LEVELS);
  return [...new Set(levels.map((l) => l.trim().toLowerCase()))].filter((l) => allowed.has(l));
}

/**
 * Deterministic Elasticsearch query for PDL /v5/person/search.
 * Filters are typed and bounded upstream; the LLM never emits raw DSL.
 *
 * Hard constraints (must): country, city/region, experience range, plus ONE
 * role signal — skills when present, otherwise job title. Job title alongside
 * skills, and seniority tags, only boost ranking (should): many PDL profiles
 * lack job_title_levels, and title phrasing varies too much to require a match.
 * location_locality uses match (not term) so metro-area naming variants still hit.
 */
export function buildPersonSearchQuery(filters: PeopleSearchFilters): object {
  const must: object[] = [];
  const should: object[] = [];

  const country = (filters.country || 'india').trim().toLowerCase();
  must.push({ term: { location_country: country } });

  if (filters.city?.trim()) {
    must.push({ match: { location_locality: filters.city.trim().toLowerCase() } });
  }
  if (filters.region?.trim()) {
    must.push({ match: { location_region: filters.region.trim().toLowerCase() } });
  }

  const skills = (filters.skills || [])
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 20);
  const jobTitle = filters.jobTitle?.trim().toLowerCase();

  if (skills.length) {
    must.push({ terms: { skills } });
    if (jobTitle) should.push({ match: { job_title: jobTitle } });
  } else if (jobTitle) {
    must.push({ match: { job_title: jobTitle } });
  }

  const levels = sanitizeSeniorityLevels(filters.seniorityLevels);
  if (levels.length) {
    const clause = { terms: { job_title_levels: levels } };
    if (skills.length || jobTitle) should.push(clause);
    else must.push(clause);
  }

  const range: { gte?: number; lte?: number } = {};
  if (typeof filters.minExperienceYears === 'number' && filters.minExperienceYears >= 0) {
    range.gte = filters.minExperienceYears;
  }
  if (typeof filters.maxExperienceYears === 'number' && filters.maxExperienceYears >= 0) {
    range.lte = filters.maxExperienceYears;
  }
  if (range.gte !== undefined || range.lte !== undefined) {
    must.push({ range: { inferred_years_experience: range } });
  }

  return should.length ? { bool: { must, should } } : { bool: { must } };
}
