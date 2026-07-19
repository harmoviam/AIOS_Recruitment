import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildPersonSearchQuery,
  clampSize,
  sanitizeSeniorityLevels,
} from '../services/sourcing/people/queryBuilder.js';
import { filtersFromIntent, mergeFilters } from '../services/sourcing/people/filtersFromIntent.js';
import { mapPdlPerson, pdlMode } from '../services/sourcing/people/pdlClient.js';
import { samplePeople } from '../services/sourcing/people/sampleProfiles.js';
import type { StructuredIntent } from '../types/sourcing.js';

const intent = (overrides: Partial<StructuredIntent> = {}): StructuredIntent => ({
  rawText: '',
  confidence: 0.8,
  unresolvedFields: [],
  ...overrides,
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('buildPersonSearchQuery', () => {
  it('defaults to an india-only query', () => {
    expect(buildPersonSearchQuery({})).toEqual({
      bool: { must: [{ term: { location_country: 'india' } }] },
    });
  });

  it('keeps location/experience/skills hard and demotes title+seniority to boosts', () => {
    const query = buildPersonSearchQuery({
      city: 'Mohali',
      jobTitle: 'React Developer',
      skills: ['React', 'TypeScript'],
      seniorityLevels: ['senior'],
      minExperienceYears: 5,
      maxExperienceYears: 10,
    });
    expect(query).toEqual({
      bool: {
        must: [
          { term: { location_country: 'india' } },
          { match: { location_locality: 'mohali' } },
          { terms: { skills: ['react', 'typescript'] } },
          { range: { inferred_years_experience: { gte: 5, lte: 10 } } },
        ],
        should: [
          { match: { job_title: 'react developer' } },
          { terms: { job_title_levels: ['senior'] } },
        ],
      },
    });
  });

  it('requires job title only when no skills are given', () => {
    const query = buildPersonSearchQuery({ jobTitle: 'Voice Process' }) as {
      bool: { must: object[]; should?: object[] };
    };
    expect(query.bool.must).toContainEqual({ match: { job_title: 'voice process' } });
    expect(query.bool.should).toBeUndefined();
  });

  it('requires seniority when it is the only role signal', () => {
    const query = buildPersonSearchQuery({ seniorityLevels: ['senior'] }) as {
      bool: { must: object[]; should?: object[] };
    };
    expect(query.bool.must).toContainEqual({ terms: { job_title_levels: ['senior'] } });
    expect(query.bool.should).toBeUndefined();
  });

  it('drops unknown seniority levels', () => {
    expect(sanitizeSeniorityLevels(['senior', 'rockstar', 'ENTRY'])).toEqual(['senior', 'entry']);
  });
});

describe('clampSize', () => {
  it('defaults to 5 and caps at the env max', () => {
    expect(clampSize(undefined)).toBe(5);
    expect(clampSize(100)).toBe(10);
    expect(clampSize(0)).toBe(1);
  });

  it('never exceeds the absolute cap of 25', () => {
    vi.stubEnv('PDL_MAX_RESULTS', '999');
    expect(clampSize(999)).toBe(25);
  });
});

describe('filtersFromIntent', () => {
  it('extracts city, skills, seniority and experience from a senior prompt', () => {
    const filters = filtersFromIntent(
      intent({ cityName: 'Mohali' }),
      'find senior React devs in Mohali with 5+ years'
    );
    expect(filters.city).toBe('Mohali');
    expect(filters.skills).toEqual(['react']);
    expect(filters.seniorityLevels).toEqual(['senior']);
    expect(filters.minExperienceYears).toBe(5);
    expect(filters.country).toBe('india');
  });

  it('maps fresher prompts to entry level with a max-experience cap', () => {
    const filters = filtersFromIntent(intent(), 'hire fresher voice process agents');
    expect(filters.seniorityLevels).toEqual(['entry', 'training']);
    expect(filters.maxExperienceYears).toBe(1);
    expect(filters.skills).toEqual(['voice process']);
  });

  it('canonicalizes node to node.js', () => {
    const filters = filtersFromIntent(intent(), 'need node developers');
    expect(filters.skills).toEqual(['node.js']);
  });
});

describe('mergeFilters', () => {
  it('lets later sources win per field and ignores empties', () => {
    const merged = mergeFilters(
      { city: 'Mohali', skills: ['react'] },
      { skills: ['react', 'redux'], jobTitle: '' },
      { size: 3 }
    );
    expect(merged).toEqual({ city: 'Mohali', skills: ['react', 'redux'], size: 3 });
  });
});

describe('mapPdlPerson', () => {
  it('maps a raw PDL record into a trimmed profile', () => {
    const profile = mapPdlPerson({
      id: 'abc123',
      full_name: 'aarav sharma',
      job_title: 'senior react developer',
      job_company_name: 'infowiz',
      location_name: 'mohali, punjab, india',
      skills: ['react', 'redux'],
      inferred_years_experience: 6,
      linkedin_url: 'linkedin.com/in/aarav',
    });
    expect(profile.fullName).toBe('Aarav Sharma');
    expect(profile.linkedinUrl).toBe('https://linkedin.com/in/aarav');
    expect(profile.experienceYears).toBe(6);
  });

  it('is null-safe on missing fields', () => {
    const profile = mapPdlPerson({});
    expect(profile.fullName).toBe('Unknown');
    expect(profile.jobTitle).toBeNull();
    expect(profile.skills).toEqual([]);
    expect(profile.linkedinUrl).toBeNull();
  });

  it('tolerates boolean-redacted fields from lower PDL plans', () => {
    const profile = mapPdlPerson({
      id: 'x1',
      full_name: 'priya verma',
      location_name: true,
      job_company_name: false,
      skills: ['react', true, null],
      linkedin_url: true,
    });
    expect(profile.fullName).toBe('Priya Verma');
    expect(profile.location).toBeNull();
    expect(profile.company).toBeNull();
    expect(profile.skills).toEqual(['react']);
    expect(profile.linkedinUrl).toBeNull();
  });
});

describe('pdlMode', () => {
  it('is simulated without a key and live with one', () => {
    vi.stubEnv('PDL_API_KEY', '');
    expect(pdlMode()).toBe('simulated');
    vi.stubEnv('PDL_API_KEY', 'test-key');
    expect(pdlMode()).toBe('live');
    vi.stubEnv('PDL_ENABLED', 'false');
    expect(pdlMode()).toBe('simulated');
  });
});

describe('samplePeople', () => {
  it('returns profiles and respects the skill filter', () => {
    const results = samplePeople({ skills: ['react'] }, 10);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((p) => p.skills.includes('react'))).toBe(true);
  });

  it('falls back to the full pool when nothing matches', () => {
    expect(samplePeople({ skills: ['cobol'] }, 5).length).toBeGreaterThan(0);
  });

  it('respects the requested size', () => {
    expect(samplePeople({}, 3)).toHaveLength(3);
  });
});
