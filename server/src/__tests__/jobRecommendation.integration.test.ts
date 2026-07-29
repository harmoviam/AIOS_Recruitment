import { describe, expect, it } from 'vitest';
import { matchScoreBarColor } from '../mappers/jobRecommendationMapper.js';
import { mapCandidateRow, mapJobRow, recommendJobs } from '../services/jobRecommendation.js';

describe('job recommendation integration (in-memory)', () => {
  it('maps DB rows and produces API-shaped recommendations', () => {
    const candidate = mapCandidateRow({
      id: 5,
      tenant_id: 1,
      latitude: 28.61,
      longitude: 77.2,
      current_location: 'Delhi',
      preferred_location: 'NCR',
      preferred_cities: ['Noida'],
      relocation_allowed: true,
      age: 24,
      gender: 'male',
      highest_qualification: 'B.Tech',
      specialization: 'IT',
      languages: ['English', 'Hindi'],
      experience_years: 2,
      skills: ['Java'],
      salary_expectation: '6 LPA',
      preferred_job_type: null,
      preferred_shift: null,
      notice_period: null,
      education: [{ degree: 'B.Tech', institution: 'DU' }],
    });

    const job = mapJobRow({
      id: 18,
      title: 'Customer Support Executive',
      client: 'ABC Ltd',
      status: 'active',
      latitude: 28.62,
      longitude: 77.21,
      address: 'Connaught Place',
      city: 'Delhi',
      state: 'Delhi',
      country: 'India',
      pincode: '110001',
      location: 'Delhi',
      required_qualification: 'Graduate',
      required_languages: ['English'],
      min_age: 18,
      max_age: 30,
      min_experience: 0,
      max_experience: 3,
      required_skills: ['Communication'],
      salary: '720000',
      shift: 'Day',
      job_type: 'On-site',
      gender_preference: null,
      open_positions: 5,
      description: 'Voice process',
    });

    const recommendations = recommendJobs(candidate, [job]);
    expect(recommendations).toHaveLength(1);
    expect(recommendations[0]).toMatchObject({
      id: 18,
      title: 'Customer Support Executive',
      company: 'ABC Ltd',
      matchScore: expect.any(Number),
      salary: '720000',
    });
    expect(recommendations[0].distance).toBeLessThan(5);
    expect(recommendations[0].reason.length).toBeGreaterThan(0);
  });

  it('maps match score to UI bar colors', () => {
    expect(matchScoreBarColor(90)).toBe('green');
    expect(matchScoreBarColor(70)).toBe('yellow');
    expect(matchScoreBarColor(50)).toBe('orange');
    expect(matchScoreBarColor(20)).toBe('red');
  });
});
