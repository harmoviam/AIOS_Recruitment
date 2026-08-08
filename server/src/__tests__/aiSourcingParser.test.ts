import { describe, expect, it, vi, afterEach } from 'vitest';
import { heuristicParseRequirements } from '../services/aiSourcing/heuristicParser.js';
import { RequirementParserService } from '../services/aiSourcing/requirementParserService.js';
import { parseCriteria, criteriaHasSignal } from '../dto/aiSourcing/criteria.js';
import { buildCriteriaClauses } from '../services/aiSourcing/candidateSearchService.js';
import type { LLMProvider } from '../services/aiSourcing/llmProvider.js';
import { isAiSourcingEnabled } from '../services/aiSourcing/featureFlag.js';
import { canSearchAiSourcing, canViewAiSourcing } from '../services/aiSourcing/access.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('heuristicParseRequirements', () => {
  it('extracts skills, location, and min experience', () => {
    const { criteria, fieldConfidence } = heuristicParseRequirements(
      'React developers in Bangalore with 3+ years'
    );
    expect(criteria.skills).toContain('react');
    expect(criteria.location?.toLowerCase()).toBe('bangalore');
    expect(criteria.minExperienceYears).toBe(3);
    expect(fieldConfidence.minExperienceYears).toBeGreaterThan(0.5);
    expect(criteria.jobTitle).toBeTruthy();
  });

  it('treats fresher as maxExperienceYears 1', () => {
    const { criteria } = heuristicParseRequirements('Fresher graduates in Hyderabad');
    expect(criteria.maxExperienceYears).toBe(1);
    expect(criteria.location?.toLowerCase()).toBe('hyderabad');
  });

  it('detects voice process role in Mohali', () => {
    const { criteria } = heuristicParseRequirements(
      'International voice process candidates in Mohali with 1+ years'
    );
    expect(criteria.location?.toLowerCase()).toBe('mohali');
    expect(criteria.minExperienceYears).toBe(1);
    expect(criteria.jobTitle).toMatch(/voice/i);
  });
});

describe('RequirementParserService', () => {
  it('falls back to heuristic when LLM unavailable', async () => {
    const llm: LLMProvider = {
      name: 'stub',
      isAvailable: () => false,
      parseRequirements: async () => null,
    };
    const svc = new RequirementParserService(llm);
    const result = await svc.parse('Python developers in Pune with 5+ years');
    expect(result.parserMode).toBe('heuristic');
    expect(result.criteria.skills).toContain('python');
    expect(result.criteria.minExperienceYears).toBe(5);
  });

  it('merges LLM criteria in hybrid mode', async () => {
    const llm: LLMProvider = {
      name: 'stub',
      isAvailable: () => true,
      parseRequirements: async () => ({
        criteria: parseCriteria({
          skills: ['kubernetes'],
          location: 'Remote',
          minExperienceYears: 4,
        }),
        fieldConfidence: { skills: 0.95, location: 0.9, minExperienceYears: 0.9 },
      }),
    };
    const svc = new RequirementParserService(llm);
    const result = await svc.parse('DevOps engineers remote with Kubernetes and AWS');
    expect(result.parserMode).toBe('hybrid');
    expect(result.criteria.skills).toEqual(expect.arrayContaining(['kubernetes', 'aws']));
    expect(result.criteria.location).toBe('Remote');
  });
});

describe('criteria validation & SQL builder', () => {
  it('rejects inverted experience range', () => {
    expect(() => parseCriteria({ minExperienceYears: 5, maxExperienceYears: 2 })).toThrow(
      /minExperienceYears/
    );
  });

  it('builds parameterized skill and location clauses', () => {
    const criteria = parseCriteria({
      skills: ['react'],
      location: 'Bangalore',
      minExperienceYears: 3,
    });
    expect(criteriaHasSignal(criteria)).toBe(true);
    const { sql, params } = buildCriteriaClauses(criteria, 2);
    expect(sql).toMatch(/experience_years/);
    expect(sql).toMatch(/current_location ILIKE/);
    expect(sql).toMatch(/jsonb_array_elements_text/);
    expect(sql).toMatch(/technical_skills/);
    expect(params).toContain(3);
    expect(params).toContain('%Bangalore%');
    expect(params).toContainEqual(['react']);
    expect(params).toContainEqual(['%react%']);
  });
});

describe('feature flag & access', () => {
  it('defaults AI_SOURCING_ENABLED to on', () => {
    vi.stubEnv('AI_SOURCING_ENABLED', undefined as unknown as string);
    expect(isAiSourcingEnabled()).toBe(true);
    vi.stubEnv('AI_SOURCING_ENABLED', 'false');
    expect(isAiSourcingEnabled()).toBe(false);
  });

  it('maps suggested permissions to org roles', () => {
    expect(canViewAiSourcing('recruiter')).toBe(true);
    expect(canSearchAiSourcing('hiring_manager')).toBe(true);
    expect(canViewAiSourcing('admin')).toBe(true);
    expect(canViewAiSourcing('guest')).toBe(false);
  });
});
