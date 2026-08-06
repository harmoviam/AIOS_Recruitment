import { describe, expect, it } from 'vitest';
import {
  analyzeExperienceConsistency,
  extractClaimedExperienceYears,
  parseExperienceDate,
} from '../services/experienceConsistency.js';
import type { ParsedProfile } from '../services/ai.js';

const now = new Date('2026-08-06T12:00:00Z');

const baseProfile = (overrides: Partial<ParsedProfile> = {}): ParsedProfile => ({
  name: 'Test',
  confidence: 0.8,
  experience: [],
  ...overrides,
});

describe('parseExperienceDate', () => {
  it('parses Month YYYY and Present', () => {
    expect(parseExperienceDate('October 2020', now)?.getFullYear()).toBe(2020);
    expect(parseExperienceDate('Present', now)?.toISOString().slice(0, 10)).toBe(
      now.toISOString().slice(0, 10)
    );
  });
});

describe('extractClaimedExperienceYears', () => {
  it('reads years from summary phrasing', () => {
    expect(
      extractClaimedExperienceYears('Data Engineer with 5+ years of experience in pipelines')
    ).toBe(5);
  });

  it('skips education CGPA / degree phrasing', () => {
    expect(
      extractClaimedExperienceYears('Bachelor of Technology CGPA: 8.59/10 July 2016 – June 2020')
    ).toBeNull();
  });
});

describe('analyzeExperienceConsistency', () => {
  it('sums employment history for Nishant-style single role', () => {
    const result = analyzeExperienceConsistency({
      profile: baseProfile({
        experience: [
          {
            title: 'Specialist Programmer',
            company: 'Infosys Limited',
            start_date: 'October 2020',
            end_date: 'Present',
          },
        ],
      }),
      now,
    });
    // Oct 2020 → Aug 2026 ≈ 5.8 years
    expect(result.employment_years).toBeGreaterThanOrEqual(5.5);
    expect(result.employment_years).toBeLessThanOrEqual(6.0);
    expect(result.claimed_years).toBeNull();
    expect(result.mismatch).toBe(false);
    expect(result.roles[0].years).toBe(result.employment_years);
  });

  it('flags when claimed summary YOE disagrees with employment sum', () => {
    const result = analyzeExperienceConsistency({
      profile: baseProfile({
        professional_summary: 'Software engineer with 8 years of experience.',
        experience: [
          {
            title: 'Engineer',
            company: 'Acme',
            start_date: 'January 2022',
            end_date: 'Present',
          },
        ],
      }),
      now,
      toleranceYears: 1,
    });
    expect(result.claimed_years).toBe(8);
    expect(result.employment_years).toBeLessThan(5);
    expect(result.mismatch).toBe(true);
    expect(result.reason).toMatch(/Experience mismatch/i);
  });

  it('does not flag when within tolerance', () => {
    const result = analyzeExperienceConsistency({
      profile: baseProfile({
        professional_summary: 'Engineer with 4.5 years of experience.',
        experience: [
          {
            title: 'Dev',
            company: 'Co',
            start_date: 'January 2022',
            end_date: 'Present',
          },
        ],
      }),
      now,
      toleranceYears: 1,
    });
    // ~4.6 years employment vs 4.5 claimed
    expect(result.mismatch).toBe(false);
  });

  it('merges overlapping roles for calendar years', () => {
    const result = analyzeExperienceConsistency({
      profile: baseProfile({
        experience: [
          {
            title: 'A',
            company: 'One',
            start_date: 'January 2020',
            end_date: 'December 2022',
          },
          {
            title: 'B',
            company: 'Two',
            start_date: 'June 2021',
            end_date: 'December 2023',
          },
        ],
      }),
      now,
    });
    // Sum ≈ 3 + 2.5 = 5.5; calendar Jan 2020–Dec 2023 ≈ 4.0
    expect(result.employment_years_sum).toBeGreaterThan(result.employment_years!);
    expect(result.employment_years).toBeGreaterThanOrEqual(3.9);
    expect(result.employment_years).toBeLessThanOrEqual(4.1);
  });
});
