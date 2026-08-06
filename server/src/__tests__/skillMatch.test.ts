import { describe, expect, it } from 'vitest';
import {
  coreSkillTokens,
  matchSkillAgainstHaystack,
  normalizeSkill,
} from '../services/skillMatch.js';
import { computeEligibilityScore } from '../services/eligibilityScore.js';
import type { ParsedProfile } from '../services/ai.js';

const baseProfile = (skills: string[]): ParsedProfile => ({
  name: 'Test',
  confidence: 0.8,
  skills,
  technical_skills: [],
  soft_skills: [],
});

describe('skillMatch', () => {
  it('matches Synapse resume text to Azure Synapse Analytics', () => {
    const haystack = normalizeSkill('Python Hadoop Apache Spark Hive Synapse SQL');
    const result = matchSkillAgainstHaystack('Azure Synapse Analytics', haystack);
    expect(result.matched).toBe(true);
    expect(result.method).toBeTruthy();
  });

  it('matches via alias group', () => {
    const haystack = normalizeSkill('Built pipelines on k8s and postgres');
    expect(matchSkillAgainstHaystack('Kubernetes', haystack).matched).toBe(true);
    expect(matchSkillAgainstHaystack('PostgreSQL', haystack).matched).toBe(true);
  });

  it('does not match unrelated skills', () => {
    const haystack = normalizeSkill('Java Spring Boot MySQL');
    expect(matchSkillAgainstHaystack('Azure Synapse Analytics', haystack).matched).toBe(false);
  });

  it('extracts synapse as core token from Azure Synapse Analytics', () => {
    expect(coreSkillTokens('Azure Synapse Analytics')).toEqual(['synapse']);
  });
});

describe('eligibility with flexible skill match', () => {
  it('credits mandatory Azure Synapse Analytics when resume only says Synapse', () => {
    const result = computeEligibilityScore(
      baseProfile(['Python', 'Spark', 'Synapse']),
      'Data engineer with Synapse and Spark',
      {
        required_skills: ['Azure Synapse Analytics', 'Python'],
        preferred_skills: [],
      }
    );
    expect(result.mandatory_matched).toEqual(
      expect.arrayContaining(['Azure Synapse Analytics', 'Python'])
    );
    expect(result.mandatory_missing).toEqual([]);
    expect(result.score).toBe(10);
  });
});
