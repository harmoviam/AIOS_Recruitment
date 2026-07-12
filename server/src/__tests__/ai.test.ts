import { describe, expect, it } from 'vitest';
import { computeParseConfidence, type ParsedProfile } from '../services/ai.js';

describe('computeParseConfidence', () => {
  it('returns AI self-score when present', () => {
    const profile = {
      name: 'Jane Doe',
      confidence: 0.87,
    } as ParsedProfile;
    expect(computeParseConfidence(profile)).toBe(0.87);
  });

  it('clamps confidence to 0–1', () => {
    const profile = {
      name: 'Jane Doe',
      confidence: 1.5,
    } as ParsedProfile;
    expect(computeParseConfidence(profile)).toBe(1);
  });

  it('uses heuristic when confidence missing', () => {
    const profile = {
      name: 'Jane Doe',
      email: 'jane@example.com',
      phone: '+911234567890',
      skills: ['Java'],
      confidence: NaN as unknown as number,
    } as ParsedProfile;
    const score = computeParseConfidence(profile);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});
