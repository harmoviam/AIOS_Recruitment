import { describe, expect, it } from 'vitest';
import type { CandidateMatchProfile, JobMatchProfile } from '../dto/jobRecommendation.js';
import {
  calculateMatchScore,
  calculateDistance,
  evaluateJobEligibility,
  recommendJobs,
} from '../services/jobRecommendation.js';

const baseCandidate = (): CandidateMatchProfile => ({
  id: 1,
  tenantId: 1,
  latitude: 28.6139,
  longitude: 77.209,
  currentLocation: 'Delhi',
  preferredLocation: 'Delhi NCR',
  preferredCities: ['Noida'],
  relocationAllowed: false,
  age: 26,
  gender: 'female',
  highestQualification: 'B.Tech',
  specialization: 'Computer Science',
  languages: ['English', 'Hindi'],
  experienceYears: 3,
  skills: ['Java', 'Spring', 'SQL'],
  expectedSalary: '8 LPA',
  preferredJobType: 'On-site',
  preferredShift: 'Day',
  noticePeriod: '30 days',
  education: [{ degree: 'B.Tech Computer Science', institution: 'DTU' }],
});

const baseJob = (overrides: Partial<JobMatchProfile> = {}): JobMatchProfile => ({
  id: 10,
  title: 'Java Developer',
  client: 'ABC Ltd',
  status: 'active',
  latitude: 28.5355,
  longitude: 77.391,
  address: 'Sector 62, Noida',
  city: 'Noida',
  state: 'UP',
  country: 'India',
  pincode: '201301',
  location: 'Noida',
  requiredQualification: 'B.Tech',
  requiredLanguages: ['English'],
  minAge: 21,
  maxAge: 35,
  minExperience: 2,
  maxExperience: 6,
  requiredSkills: ['Java', 'Spring'],
  salary: '9 LPA',
  shift: 'Day',
  jobType: 'On-site',
  genderPreference: null,
  openPositions: 2,
  description: 'Java backend role',
  ...overrides,
});

describe('calculateDistance', () => {
  it('returns km between candidate and job', () => {
    const d = calculateDistance(28.6139, 77.209, 28.5355, 77.391);
    expect(d).toBeGreaterThan(0);
  });
});

describe('calculateMatchScore', () => {
  it('scores a strong nearby match highly', () => {
    const candidate = baseCandidate();
    const job = baseJob();
    const distance = calculateDistance(
      candidate.latitude!,
      candidate.longitude!,
      job.latitude!,
      job.longitude!
    );
    const result = calculateMatchScore(candidate, job, distance);
    expect(result.total).toBeGreaterThanOrEqual(70);
    expect(result.rejected).toBe(false);
    expect(result.reason).toContain('Location');
  });

  it('auto-rejects when age is outside range', () => {
    const candidate = { ...baseCandidate(), age: 40 };
    const job = baseJob({ maxAge: 30 });
    const result = calculateMatchScore(candidate, job, 5);
    expect(result.rejected).toBe(true);
    expect(result.rejectionReason).toMatch(/Age/i);
  });

  it('auto-rejects far jobs when not willing to relocate', () => {
    const candidate = { ...baseCandidate(), relocationAllowed: false };
    const job = baseJob({ latitude: 19.076, longitude: 72.8777 });
    const distance = calculateDistance(
      candidate.latitude!,
      candidate.longitude!,
      job.latitude!,
      job.longitude!
    );
    expect(distance).toBeGreaterThan(100);
    const result = calculateMatchScore(candidate, job, distance);
    expect(result.rejected).toBe(true);
  });

  it('allows far jobs when willing to relocate', () => {
    const candidate = { ...baseCandidate(), relocationAllowed: true };
    const job = baseJob({ latitude: 19.076, longitude: 72.8777 });
    const distance = calculateDistance(
      candidate.latitude!,
      candidate.longitude!,
      job.latitude!,
      job.longitude!
    );
    const result = calculateMatchScore(candidate, job, distance);
    expect(result.rejected).toBe(false);
  });

  it('auto-rejects missing mandatory qualification', () => {
    const candidate = { ...baseCandidate(), highestQualification: '12th', education: [] };
    const job = baseJob({ requiredQualification: 'MBA' });
    const result = calculateMatchScore(candidate, job, 3);
    expect(result.rejected).toBe(true);
  });

  it('auto-rejects missing required language', () => {
    const candidate = { ...baseCandidate(), languages: ['Hindi'] };
    const job = baseJob({ requiredLanguages: ['French'] });
    const result = calculateMatchScore(candidate, job, 3);
    expect(result.rejected).toBe(true);
  });
});

describe('recommendJobs', () => {
  it('returns only active jobs sorted by match score', () => {
    const candidate = baseCandidate();
    const jobs = [
      baseJob({ id: 1, title: 'Best fit' }),
      baseJob({ id: 2, title: 'Closed', status: 'inactive' }),
      baseJob({
        id: 3,
        title: 'Remote',
        location: 'Remote',
        jobType: 'Remote',
        latitude: null,
        longitude: null,
      }),
    ];
    const results = recommendJobs(candidate, jobs);
    expect(results.some((r) => r.title === 'Closed')).toBe(false);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].matchScore).toBeGreaterThanOrEqual(results[results.length - 1]?.matchScore ?? 0);
  });

  it('respects max distance filter', () => {
    const candidate = baseCandidate();
    const jobs = [
      baseJob({ id: 1 }),
      baseJob({ id: 2, latitude: 19.076, longitude: 72.8777, city: 'Mumbai' }),
    ];
    const nearby = recommendJobs(candidate, jobs, { maxDistanceKm: 50 });
    expect(nearby.every((j) => j.distance == null || j.distance <= 50)).toBe(true);
  });

  it('reports remote jobs without a misleading zero-kilometre distance', () => {
    const results = recommendJobs(baseCandidate(), [
      baseJob({ location: 'Remote', jobType: 'Remote', latitude: null, longitude: null }),
    ]);
    expect(results[0]?.distance).toBeNull();
    expect(results[0]?.isRemote).toBe(true);
  });

  it('restricts suggestions to the assigned job city', () => {
    const jobs = [
      baseJob({ id: 1, client: 'Noida Co', city: 'Noida', location: 'Noida' }),
      baseJob({ id: 2, client: 'Mumbai Co', city: 'Mumbai', location: 'Mumbai' }),
      baseJob({
        id: 3,
        client: 'Remote Co',
        city: null,
        location: 'Remote',
        jobType: 'Remote',
        latitude: null,
        longitude: null,
      }),
    ];
    const results = recommendJobs(baseCandidate(), jobs, { city: 'Noida' });
    expect(results.map((result) => result.company)).toEqual(['Noida Co']);
  });

  it('requires every job language for company eligibility', () => {
    const eligibility = evaluateJobEligibility(
      { ...baseCandidate(), languages: ['English'] },
      baseJob({ requiredLanguages: ['English', 'Hindi'] })
    );
    expect(eligibility).toEqual({ eligible: false, reason: 'languages' });
  });

  it('rejects a job below the candidate salary expectation', () => {
    const eligibility = evaluateJobEligibility(
      { ...baseCandidate(), expectedSalary: '10 LPA' },
      baseJob({ salary: '9 LPA' })
    );
    expect(eligibility).toEqual({ eligible: false, reason: 'salary' });
  });

  it('rejects constrained jobs when candidate age is unavailable', () => {
    const eligibility = evaluateJobEligibility(
      { ...baseCandidate(), age: null },
      baseJob({ minAge: 21, maxAge: 35 })
    );
    expect(eligibility).toEqual({ eligible: false, reason: 'age_missing' });
  });
});
