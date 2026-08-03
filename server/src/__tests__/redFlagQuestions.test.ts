import { describe, expect, it } from 'vitest';
import {
  assessSalaryAlignment,
  buildRedFlagQuestions,
  parseSalaryToAnnual,
} from '../services/redFlagQuestions.js';

describe('parseSalaryToAnnual', () => {
  it('reads LPA, ranges, monthly, and bare numbers', () => {
    expect(parseSalaryToAnnual('4.2 LPA')).toBe(420_000);
    expect(parseSalaryToAnnual('3-5 LPA')).toBe(500_000); // top of the range
    expect(parseSalaryToAnnual('25k per month')).toBe(300_000);
    expect(parseSalaryToAnnual('₹4,20,000')).toBe(420_000);
    expect(parseSalaryToAnnual('6')).toBe(600_000); // bare number reads as lakhs
  });

  it('returns null for unusable input', () => {
    expect(parseSalaryToAnnual(null)).toBeNull();
    expect(parseSalaryToAnnual('')).toBeNull();
    expect(parseSalaryToAnnual('negotiable')).toBeNull();
  });
});

describe('assessSalaryAlignment', () => {
  it('flags an expectation above the job ceiling as over budget', () => {
    const result = assessSalaryAlignment('6 LPA', '4.2 LPA');
    expect(result.level).toBe('over_budget');
    expect(result.message).toMatch(/High no-show risk/);
  });

  it('flags an expectation within 10% of the ceiling as tight', () => {
    const result = assessSalaryAlignment('4 LPA', '4.2 LPA');
    expect(result.level).toBe('tight');
    expect(result.message).toMatch(/no room to negotiate/);
  });

  it('passes an expectation comfortably inside the band', () => {
    expect(assessSalaryAlignment('3 LPA', '5 LPA').level).toBe('ok');
  });

  it('reports unknown when either side is missing', () => {
    expect(assessSalaryAlignment(null, '5 LPA').level).toBe('unknown');
    expect(assessSalaryAlignment('3 LPA', null).level).toBe('unknown');
  });
});

describe('buildRedFlagQuestions', () => {
  const baseline = {
    jobTitle: 'Customer Support Executive',
    industry: 'BPO',
    experienceYears: 4,
    salaryAlignment: assessSalaryAlignment('3 LPA', '5 LPA'),
  };

  it('always returns the seven scorable signals in a fixed order', () => {
    expect(buildRedFlagQuestions(baseline).map((q) => q.id)).toEqual([
      'vague_motivation',
      'uncertain_joining_timeline',
      'avoids_current_status',
      'non_committed_language',
      'salary_focus_early',
      'low_energy',
      'weak_communication',
    ]);
  });

  it('fits the 5-7 minute budget', () => {
    const total = buildRedFlagQuestions(baseline).reduce((sum, q) => sum + q.time_seconds, 0);
    expect(total).toBeGreaterThanOrEqual(300);
    expect(total).toBeLessThanOrEqual(420);
  });

  it('asks the required recruiter questions verbatim', () => {
    const asks = buildRedFlagQuestions(baseline).map((q) => q.ask).join(' | ');
    expect(asks).toMatch(/how soon can you join/i);
    expect(asks).toMatch(/notice period/i);
    expect(asks).toMatch(/offer in hand/i);
  });

  it('confronts the candidate with the range when they are over budget', () => {
    const questions = buildRedFlagQuestions({
      ...baseline,
      salaryAlignment: assessSalaryAlignment('6 LPA', '4.2 LPA'),
    });
    const salary = questions.find((q) => q.id === 'salary_focus_early')!;
    expect(salary.ask).toMatch(/will you accept the offered range/i);
    expect(salary.hint).toMatch(/High no-show risk/);
  });

  it('words the current-status probe differently for freshers', () => {
    const fresher = buildRedFlagQuestions({ ...baseline, experienceYears: 0 });
    const status = fresher.find((q) => q.id === 'avoids_current_status')!;
    expect(status.ask).toMatch(/studying/i);
    expect(status.ask).not.toMatch(/notice period/i);
  });

  it('reflects the sector in the motivation and communication probes', () => {
    const bpo = buildRedFlagQuestions(baseline);
    expect(bpo.find((q) => q.id === 'low_energy')!.ask).toMatch(/BPO/);
    expect(bpo.find((q) => q.id === 'weak_communication')!.ask).toMatch(/shift|commute/i);

    const manufacturing = buildRedFlagQuestions({ ...baseline, industry: 'Manufacturing' });
    expect(manufacturing.find((q) => q.id === 'weak_communication')!.ask).toMatch(/plant|shift/i);
  });

  it('pitches motivation at the experience level', () => {
    const fresher = buildRedFlagQuestions({ ...baseline, experienceYears: 0 });
    const senior = buildRedFlagQuestions({ ...baseline, experienceYears: 12 });
    expect(fresher.find((q) => q.id === 'vague_motivation')!.ask).toMatch(/start your career/i);
    expect(senior.find((q) => q.id === 'vague_motivation')!.ask).toMatch(/at your level/i);
  });
});
