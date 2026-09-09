import { describe, expect, it } from 'vitest';
import { heuristicParseRequirements } from '../services/aiSourcing/heuristicParser.js';
import { parseCriteria, criteriaHasSignal } from '../dto/aiSourcing/criteria.js';
import { buildCriteriaClauses } from '../services/aiSourcing/candidateSearchService.js';
import {
  intelligenceToCriteria,
  normalizeSkillList,
} from '../services/aiSourcing/jdIntelligenceService.js';
import { emptyJobIntelligence, parseJobIntelligence } from '../dto/aiSourcing/jobIntelligence.js';
import {
  emptyCandidateIntelligence,
  parseCandidateIntelligence,
} from '../dto/aiSourcing/candidateIntelligence.js';
import { skillOntologyService } from '../services/aiSourcing/skillOntologyService.js';

describe('Sprint 2 heuristic parser extensions', () => {
  it('extracts industry, notice period, salary and cloud role', () => {
    const { criteria, fieldConfidence } = heuristicParseRequirements(
      'Find AWS Cloud Architects in Bangalore with healthcare experience, Terraform, Kubernetes, 10+ years experience, salary below 55 LPA and notice period below 30 days'
    );
    expect(criteria.jobTitle).toMatch(/cloud architect/i);
    expect(criteria.skills).toEqual(expect.arrayContaining(['aws', 'terraform', 'kubernetes']));
    expect(criteria.industries).toContain('healthcare');
    expect(criteria.minExperienceYears).toBe(10);
    expect(criteria.noticePeriodMaxDays).toBe(30);
    expect(criteria.maxSalaryLpa).toBe(55);
    expect(criteria.location?.toLowerCase()).toBe('bangalore');
    expect(fieldConfidence.industries).toBeGreaterThan(0.5);
  });
});

describe('JD intelligence → criteria', () => {
  it('maps structured JD intelligence into search criteria', () => {
    const intel = parseJobIntelligence({
      ...emptyJobIntelligence(),
      role: 'Cloud Architect',
      requiredSkills: ['AWS', 'Terraform'],
      preferredSkills: ['Kubernetes'],
      industries: ['Healthcare'],
      minExperienceYears: 10,
      location: 'Bangalore',
      noticePeriodMaxDays: 30,
      maxSalaryLpa: 55,
    });
    const criteria = intelligenceToCriteria(intel);
    expect(criteria.jobTitle).toBe('Cloud Architect');
    expect(criteria.skills).toEqual(expect.arrayContaining(['AWS', 'Terraform']));
    expect(criteria.preferredSkills).toContain('Kubernetes');
    expect(criteria.industries).toContain('Healthcare');
    expect(criteria.noticePeriodMaxDays).toBe(30);
    expect(normalizeSkillList(['AWS', 'aws', 'EKS'])).toEqual(
      expect.arrayContaining(['aws', 'eks'])
    );
  });
});

describe('Candidate intelligence DTO', () => {
  it('validates and preserves missing field list', () => {
    const profile = parseCandidateIntelligence({
      ...emptyCandidateIntelligence(),
      name: 'Rahul Sharma',
      skills: ['AWS', 'Terraform'],
      missingFields: ['certifications', 'notice_period'],
    });
    expect(profile.name).toBe('Rahul Sharma');
    expect(profile.missingFields).toContain('certifications');
  });
});

describe('Hybrid criteria SQL builder', () => {
  it('includes technical_skills, industry and notice filters', () => {
    const criteria = parseCriteria({
      skills: ['eks'],
      industries: ['healthcare'],
      noticePeriodMaxDays: 30,
      maxSalaryLpa: 55,
      minExperienceYears: 10,
      location: 'Bangalore',
    });
    expect(criteriaHasSignal(criteria)).toBe(true);
    const { sql, params } = buildCriteriaClauses(criteria, 2, {
      expandedSkills: ['eks', 'kubernetes', 'aws'],
    });
    expect(sql).toMatch(/technical_skills/);
    expect(sql).toMatch(/notice_period/);
    expect(sql).toMatch(/salary_expectation/);
    expect(sql).toMatch(/industry/);
    expect(params).toContain(10);
    expect(params).toContain(30);
    expect(params).toContain(55);
    expect(params).toContainEqual(['eks', 'kubernetes', 'aws']);
  });

  it('treats immediate/blank notice as available when a notice cap is set', () => {
    const criteria = parseCriteria({ noticePeriodMaxDays: 30 });
    const { sql, params } = buildCriteriaClauses(criteria, 2);
    expect(sql).toMatch(/immediate|immediately/);
    expect(params).toContain(30);
  });

  it('builds an immediate-joiners-only clause and avoids notice-cap duplication', () => {
    const criteria = parseCriteria({
      noticePeriodMaxDays: 30,
      immediateJoinerOnly: true,
    });
    const { sql, params } = buildCriteriaClauses(criteria, 2);
    expect(sql).toMatch(/immediate/);
    // Cap duplicates would produce two "<= $N" notice clauses; ensure only immediate scope applies
    const capCount = (sql.match(/CAST\(SUBSTRING\(c\.notice_period FROM '\\d\+'\) AS INTEGER\) <= /g) || []).length;
    expect(capCount).toBe(0);
    expect(criteriaHasSignal(criteria)).toBe(true);
  });

  it('normalizes absolute rupee salaries to LPA when building the cap', () => {
    const criteria = parseCriteria({ maxSalaryLpa: 55 });
    const { sql } = buildCriteriaClauses(criteria, 2);
    expect(sql).toMatch(/100000\.0/);
  });
});

describe('Skill ontology normalize', () => {
  it('normalizes skill strings deterministically', () => {
    expect(skillOntologyService.normalize('Node.js')).toBe('nodejs');
    expect(skillOntologyService.normalizeMany(['AWS', 'aws', 'K8s'])).toEqual(['aws', 'k8s']);
  });
});
