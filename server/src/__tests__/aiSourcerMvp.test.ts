import { describe, expect, it, vi, afterEach } from 'vitest';
import { heuristicParseRequirements } from '../services/aiSourcing/heuristicParser.js';
import { parseCriteria } from '../dto/aiSourcing/criteria.js';
import {
  emptyMvpCriteria,
  parseMvpCriteria,
  toMvpCriteria,
  toMvpCriteriaJson,
  splitLocations,
  parseSalaryRangeLpa,
  extractPreferredSkillNames,
} from '../dto/aiSourcing/mvpCriteria.js';
import {
  scoreCandidate,
  getMvpScoreWeights,
  parseMvpNoticeDays,
  parseMvpSalaryLpa,
  DEFAULT_MVP_SCORE_WEIGHTS,
  type MvpCandidateSignals,
} from '../services/aiSourcing/mvpScorer.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

const DEVOPS_QUERY =
  'Looking for a DevOps Engineer with 4–7 years experience in AWS, Kubernetes, Terraform and GitHub Actions. ' +
  'Candidate should be located in Chandigarh, Mohali or willing to work remotely. Notice period maximum 30 days.';

describe('Phase 1 — MVP requirement extraction', () => {
  it('maps the DevOps MVP example to reviewable criteria', () => {
    const { criteria } = heuristicParseRequirements(DEVOPS_QUERY);
    const mvp = toMvpCriteria({ criteria, rawText: DEVOPS_QUERY });

    expect(mvp.jobTitle).toMatch(/devops/i);
    expect(mvp.requiredSkills).toEqual(
      expect.arrayContaining(['aws', 'kubernetes', 'terraform'])
    );
    expect(mvp.experienceMin).toBe(4);
    expect(mvp.experienceMax).toBe(7);
    expect(mvp.locations).toEqual(expect.arrayContaining(['Chandigarh', 'Mohali', 'Remote']));
    expect(mvp.locations).not.toContain('Aws');
    expect(mvp.noticePeriodMaxDays).toBe(30);

    const json = toMvpCriteriaJson(mvp);
    expect(json).toMatchObject({
      experience_min: 4,
      experience_max: 7,
      notice_period_max: 30,
    });
    expect(Object.keys(json).sort()).toEqual(
      [
        'job_title',
        'required_skills',
        'preferred_skills',
        'experience_min',
        'experience_max',
        'locations',
        'notice_period_max',
        'salary_min',
        'salary_max',
      ].sort()
    );
  });

  it('demotes exposure-style skills to preferred (Java spec example)', () => {
    const query =
      'Find Java developers in Chandigarh or Mohali with 3 to 6 years of experience, ' +
      'Spring Boot, Kafka, AWS exposure, maximum 30-day notice period, and salary expectation below ₹18 LPA.';
    const { criteria } = heuristicParseRequirements(query);
    const mvp = toMvpCriteria({ criteria, rawText: query });

    expect(mvp.requiredSkills).toEqual(expect.arrayContaining(['java', 'spring boot', 'kafka']));
    expect(mvp.requiredSkills.map((s) => s.toLowerCase())).not.toContain('aws');
    expect(mvp.preferredSkills.map((s) => s.toLowerCase())).toContain('aws');
    expect(mvp.experienceMin).toBe(3);
    expect(mvp.experienceMax).toBe(6);
    expect(mvp.locations).toEqual(expect.arrayContaining(['Chandigarh', 'Mohali']));
    expect(mvp.noticePeriodMaxDays).toBe(30);
    expect(mvp.salaryMaxLpa).toBe(18);
  });

  it('lets explicit job preferred skills win ties', () => {
    const mvp = toMvpCriteria({
      criteria: parseCriteria({ skills: ['aws', 'github actions'] }),
      jobPreferredSkills: ['GitHub Actions'],
    });
    expect(mvp.requiredSkills.map((s) => s.toLowerCase())).toEqual(['aws']);
    expect(mvp.preferredSkills).toHaveLength(1);
  });

  it('parses LPA salary ranges', () => {
    expect(parseSalaryRangeLpa('₹18–25 LPA')).toEqual({ min: 18, max: 25 });
    expect(parseSalaryRangeLpa('CTC 18-25 lakh')).toEqual({ min: 18, max: 25 });
    expect(parseSalaryRangeLpa('salary below 55 LPA')).toEqual({ min: null, max: 55 });
    expect(parseSalaryRangeLpa('no salary mentioned')).toEqual({ min: null, max: null });
  });

  it('splits multi-city locations and scans raw text', () => {
    expect(splitLocations('Chandigarh', 'Mohali or willing to work remotely')).toEqual(
      expect.arrayContaining(['Chandigarh', 'Mohali', 'Remote'])
    );
    expect(splitLocations('Chandigarh/Mohali')).toEqual(['Chandigarh', 'Mohali']);
    expect(splitLocations(null, null)).toEqual([]);
  });

  it('drops explicit locations that are literally detected skills', () => {
    // Heuristic misfire: "experience in AWS" parsed as location "AWS".
    expect(splitLocations('AWS', DEVOPS_QUERY, ['aws', 'kubernetes'])).toEqual(
      expect.arrayContaining(['Chandigarh', 'Mohali', 'Remote'])
    );
    expect(splitLocations('AWS', DEVOPS_QUERY, ['aws', 'kubernetes'])).not.toContain('Aws');
  });

  it('extracts preferred skills from cue clauses', () => {
    expect(extractPreferredSkillNames('Need AWS, preferred Terraform', ['aws', 'terraform'])).toEqual([
      'terraform',
    ]);
    expect(extractPreferredSkillNames('Need AWS and Terraform', ['aws', 'terraform'])).toEqual([]);
  });

  it('rejects inverted MVP ranges', () => {
    expect(() => parseMvpCriteria({ ...emptyMvpCriteria(), experienceMin: 7, experienceMax: 4 })).toThrow(
      /experienceMin/
    );
    expect(() => parseMvpCriteria({ ...emptyMvpCriteria(), salaryMinLpa: 30, salaryMaxLpa: 20 })).toThrow(
      /salaryMinLpa/
    );
  });
});

describe('Phase 2 — deterministic MVP scoring', () => {
  const mvp = toMvpCriteria({
    criteria: parseCriteria({
      skills: ['aws', 'kubernetes', 'terraform'],
      preferredSkills: ['github actions'],
      minExperienceYears: 4,
      maxExperienceYears: 7,
      maxSalaryLpa: 25,
      noticePeriodMaxDays: 30,
    }),
    rawText: 'DevOps Engineer in Mohali',
  });

  const strong: MvpCandidateSignals = {
    skills: ['AWS', 'Kubernetes', 'Terraform', 'GitHub Actions'],
    experienceYears: 5,
    currentLocation: 'Mohali',
    noticePeriod: '30 days',
    salaryExpectation: '20 LPA',
  };

  it('scores a strong match at 100 with full breakdown', () => {
    const s = scoreCandidate(mvp, strong);
    expect(s.matchScore).toBe(100);
    expect(s.scoreBreakdown).toEqual({ skills: 50, experience: 20, location: 15, notice: 10, salary: 5 });
    expect(s.missingRequiredSkills).toEqual([]);
    expect(s.matchedPreferredSkills).toEqual(['github actions']);
    expect(s.salaryRedistributed).toBe(false);
  });

  it('lowers the score instead of rejecting on gaps', () => {
    const s = scoreCandidate(mvp, {
      skills: ['AWS', 'Kubernetes', 'GitHub Actions'],
      experienceYears: 2,
      currentLocation: 'Delhi',
      noticePeriod: '60 days',
      salaryExpectation: '30 LPA',
    });
    expect(s.matchScore).toBe(48);
    expect(s.scoreBreakdown).toEqual({ skills: 33, experience: 10, location: 0, notice: 5, salary: 0 });
    expect(s.missingRequiredSkills).toEqual(['terraform']);
  });

  it('redistributes salary weight when salary data is unavailable', () => {
    const s = scoreCandidate(mvp, { ...strong, salaryExpectation: null });
    expect(s.scoreBreakdown.salary).toBeNull();
    expect(s.salaryRedistributed).toBe(true);
    expect(s.matchScore).toBe(100);
  });

  it('treats unknown notice as available, consistent with search', () => {
    expect(parseMvpNoticeDays(null)).toBeNull();
    const s = scoreCandidate(mvp, { ...strong, noticePeriod: null, salaryExpectation: null });
    expect(s.scoreBreakdown.notice).toBe(10);
  });

  it('normalizes absolute rupee salaries to LPA like search does', () => {
    expect(parseMvpSalaryLpa('700000')).toBe(7);
    expect(parseMvpSalaryLpa('20 LPA')).toBe(20);
    const s = scoreCandidate(mvp, { ...strong, salaryExpectation: '700000' });
    expect(s.scoreBreakdown.salary).toBe(5);
  });

  it('supports configurable weights via env', () => {
    vi.stubEnv(
      'AI_SOURCING_SCORING_WEIGHTS',
      JSON.stringify({ skills: 100, experience: 0, location: 0, notice: 0, salary: 0 })
    );
    const w = getMvpScoreWeights();
    expect(w.skills).toBeCloseTo(100);
    expect(scoreCandidate(mvp, strong, w).matchScore).toBe(100);
  });

  it('falls back to defaults on invalid weight config', () => {
    vi.stubEnv('AI_SOURCING_SCORING_WEIGHTS', 'not-json');
    expect(getMvpScoreWeights()).toEqual(DEFAULT_MVP_SCORE_WEIGHTS);
  });

  it('ignores non-job signals such as protected attributes', () => {
    const base = scoreCandidate(mvp, strong);
    const withExtra = scoreCandidate(mvp, { ...strong, gender: 'female', photo: true } as unknown as MvpCandidateSignals);
    expect(withExtra).toEqual(base);
  });

  it('scores empty criteria and empty candidates without crashing', () => {
    const empty = toMvpCriteria({ criteria: parseCriteria({}) });
    const s = scoreCandidate(empty, {});
    expect(s.matchScore).toBe(100);
    expect(s.missingRequiredSkills).toEqual([]);
  });
});
