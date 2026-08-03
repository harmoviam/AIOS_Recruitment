import { describe, expect, it } from 'vitest';
import { computeAtsScore } from '../services/atsScore.js';
import type { ParsedProfile } from '../services/ai.js';

function profile(overrides: Partial<ParsedProfile> = {}): ParsedProfile {
  return {
    name: 'Asha Menon',
    email: 'asha@example.com',
    phone: '9876543210',
    current_location: 'Bengaluru',
    professional_summary:
      'Customer support specialist with four years in international voice process, handling escalations and retention for a telecom account.',
    skills: ['Customer Support', 'Escalation Handling', 'CRM', 'Retention'],
    technical_skills: ['Salesforce', 'Zendesk', 'Excel', 'Genesys'],
    experience: [
      {
        title: 'Senior Associate',
        company: 'Acme BPO',
        start_date: '2021-03',
        end_date: '2025-01',
        description: 'Handled escalations for a telecom account and mentored new joiners.',
      },
    ],
    education: [{ degree: 'B.Com', institution: 'Bangalore University', year: '2020' }],
    confidence: 0.9,
    ...overrides,
  } as ParsedProfile;
}

const RESUME_TEXT = `Asha Menon
Summary
Customer support specialist.
Work Experience
Senior Associate, Acme BPO, 2021-2025. Handled escalations, used Salesforce and Zendesk daily.
Education
B.Com, Bangalore University, 2020
Skills
Customer Support, Escalation Handling, CRM, Retention, Salesforce, Zendesk, Excel, Genesys
${'filler detail about call handling and quality scores. '.repeat(20)}`;

describe('computeAtsScore', () => {
  it('scores a complete, well-structured resume highly', () => {
    const result = computeAtsScore(profile(), RESUME_TEXT);
    expect(result.score).toBeGreaterThanOrEqual(85);
    expect(result.grade).toBe('Excellent');
    expect(result.missing).toEqual([]);
  });

  it('penalises a resume with no contact details, skills, or education', () => {
    const bare = profile({
      email: null,
      phone: null,
      current_location: null,
      professional_summary: null,
      skills: [],
      technical_skills: [],
      education: [],
      experience: [],
      confidence: 0.2,
    });
    const result = computeAtsScore(bare, 'Asha Menon');
    expect(result.score).toBeLessThan(50);
    expect(result.grade).toBe('Poor');
    expect(result.missing).toContain('Email address');
    expect(result.missing).toContain('Skills section');
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  it('never exceeds 100 and always returns every category', () => {
    const result = computeAtsScore(profile(), RESUME_TEXT);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.categories.map((c) => c.key)).toEqual([
      'contact',
      'summary',
      'skills',
      'experience',
      'education',
      'parseability',
      'job_match',
    ]);
  });

  it('scores JD keyword match when required skills are supplied', () => {
    const result = computeAtsScore(profile(), RESUME_TEXT, {
      title: 'Customer Support Executive',
      required_skills: ['Salesforce', 'Zendesk', 'Kubernetes', 'Terraform'],
    });
    expect(result.scored_against_job).toBe(true);
    expect(result.matched_keywords).toEqual(['Salesforce', 'Zendesk']);
    expect(result.missing_keywords).toEqual(['Kubernetes', 'Terraform']);
    const jobMatch = result.categories.find((c) => c.key === 'job_match')!;
    expect(jobMatch.score).toBeCloseTo(7.5, 1);
  });

  it('awards full keyword weight when there is no job to match against', () => {
    const result = computeAtsScore(profile(), RESUME_TEXT, null);
    const jobMatch = result.categories.find((c) => c.key === 'job_match')!;
    expect(jobMatch.score).toBe(jobMatch.max);
    expect(result.scored_against_job).toBe(false);
  });

  it('flags an image-only resume through the parseability category', () => {
    const result = computeAtsScore(profile({ confidence: 0.3 }), 'Asha Menon 9876543210');
    const parseability = result.categories.find((c) => c.key === 'parseability')!;
    expect(parseability.score).toBeLessThan(parseability.max / 2);
    expect(parseability.detail).toMatch(/scanned or image-based/);
  });
});
