import { describe, expect, it } from 'vitest';
import {
  extractHiringCount,
  extractSalaryHint,
} from '../services/sourcing/conversation/heuristicConversationService.js';

describe('extractHiringCount', () => {
  it('finds the count when a role phrase separates it from the noun', () => {
    expect(
      extractHiringCount('Need 50 International Voice Process candidates in Mohali within 15 days')
    ).toBe(50);
  });

  it('recognizes hiring nouns beyond "candidates"', () => {
    expect(extractHiringCount('Hire 20 fresher voice process agents in Mohali, salary up to 22000')).toBe(
      20
    );
  });

  it('does not grab an unrelated day/year figure that precedes the real count', () => {
    expect(extractHiringCount('Hire in 15 days for 20 openings')).toBe(20);
  });

  it('does not mistake a headcount for a salary figure and vice versa', () => {
    expect(
      extractHiringCount('Need 5000 candidates in Chandigarh within 10 days, salary 18000/month')
    ).toBe(5000);
  });

  it('falls back to a hiring verb immediately before the number', () => {
    expect(extractHiringCount('Hire 20 for the new Mohali center')).toBe(20);
  });

  it('returns undefined when no counting context is present', () => {
    expect(extractHiringCount('Looking for React developers in Mohali')).toBeUndefined();
  });
});

describe('extractSalaryHint', () => {
  it('requires a salary/currency keyword rather than the first 4-6 digit number', () => {
    expect(extractSalaryHint('Need 5000 candidates in Chandigarh, salary 18000/month')).toBe(18000);
  });

  it('reads a pay-period suffix even without a leading keyword', () => {
    expect(extractSalaryHint('offering 22000/month for the role')).toBe(22000);
  });

  it('reads "salary up to N"', () => {
    expect(extractSalaryHint('Hire 20 fresher voice process agents in Mohali, salary up to 22000')).toBe(
      22000
    );
  });

  it('returns undefined when no salary or pay-period signal exists', () => {
    expect(extractSalaryHint('Need 5000 candidates in Chandigarh within 10 days')).toBeUndefined();
  });
});
