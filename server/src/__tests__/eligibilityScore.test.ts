import { describe, expect, it } from 'vitest';
import {
  applyEligibilityNudge,
  computeEligibilityScore,
  evaluateExperienceGate,
} from '../services/eligibilityScore.js';
import type { ParsedProfile } from '../services/ai.js';

const baseProfile = (skills: string[]): ParsedProfile => ({
  name: 'Test',
  confidence: 0.8,
  skills,
  technical_skills: [],
  soft_skills: [],
});

describe('computeEligibilityScore', () => {
  it('weights mandatory 70% and preferred 30%', () => {
    const result = computeEligibilityScore(
      baseProfile(['React', 'TypeScript', 'GraphQL']),
      'React TypeScript GraphQL expert',
      {
        required_skills: ['React', 'TypeScript', 'Node'],
        preferred_skills: ['GraphQL', 'AWS'],
      }
    );
    // mandatory 2/3, preferred 1/2 → 0.7*(2/3)*10 + 0.3*(1/2)*10 = 4.666... + 1.5 = 6.2
    expect(result.score).toBe(6.2);
    expect(result.mandatory_matched).toEqual(['React', 'TypeScript']);
    expect(result.mandatory_missing).toEqual(['Node']);
    expect(result.preferred_matched).toEqual(['GraphQL']);
    expect(result.preferred_missing).toEqual(['AWS']);
  });

  it('uses 100% mandatory when preferred is empty', () => {
    const result = computeEligibilityScore(
      baseProfile(['React', 'TypeScript']),
      '',
      { required_skills: ['React', 'TypeScript'], preferred_skills: [] }
    );
    expect(result.score).toBe(10);
  });

  it('scores perfect match at 10', () => {
    const result = computeEligibilityScore(
      baseProfile(['React', 'Node', 'AWS']),
      '',
      {
        required_skills: ['React', 'Node'],
        preferred_skills: ['AWS'],
      }
    );
    expect(result.score).toBe(10);
  });
});

describe('applyEligibilityNudge', () => {
  it('clamps AI nudge to ±1 of base', () => {
    expect(applyEligibilityNudge(7, 9.5)).toBe(8);
    expect(applyEligibilityNudge(7, 4)).toBe(6);
    expect(applyEligibilityNudge(7, null)).toBe(7);
  });
});

describe('evaluateExperienceGate', () => {
  it('passes when job has no min experience', () => {
    expect(evaluateExperienceGate(0, null).passed).toBe(true);
    expect(evaluateExperienceGate(0, 0).passed).toBe(true);
    expect(evaluateExperienceGate(2, undefined).passed).toBe(true);
  });

  it('rejects when candidate YOE is below min', () => {
    const result = evaluateExperienceGate(2, 5);
    expect(result.passed).toBe(false);
    expect(result.candidate_years).toBe(2);
    expect(result.required_years).toBe(5);
    expect(result.reason).toContain('Insufficient experience');
  });

  it('passes when candidate meets or exceeds min', () => {
    expect(evaluateExperienceGate(5, 5).passed).toBe(true);
    expect(evaluateExperienceGate(7.5, 5).passed).toBe(true);
  });

  it('treats missing candidate YOE as 0', () => {
    const result = evaluateExperienceGate(null, 3);
    expect(result.passed).toBe(false);
    expect(result.candidate_years).toBe(0);
  });
});
