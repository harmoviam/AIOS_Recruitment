import { z } from 'zod';

export const candidateIntelligenceSchema = z.object({
  name: z.string().trim().max(160).optional().nullable(),
  email: z.string().trim().max(200).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  location: z.string().trim().max(120).optional().nullable(),
  currentRole: z.string().trim().max(160).optional().nullable(),
  currentCompany: z.string().trim().max(160).optional().nullable(),
  previousCompanies: z.array(z.string().trim().min(1).max(160)).max(30).optional().default([]),
  totalExperienceYears: z.number().min(0).max(60).optional().nullable(),
  skills: z.array(z.string().trim().min(1).max(64)).max(60).optional().default([]),
  normalizedSkills: z.array(z.string().trim().min(1).max(64)).max(60).optional().default([]),
  industries: z.array(z.string().trim().min(1).max(80)).max(15).optional().default([]),
  education: z.array(z.string().trim().min(1).max(200)).max(15).optional().default([]),
  certifications: z.array(z.string().trim().min(1).max(160)).max(20).optional().default([]),
  expectedSalary: z.string().trim().max(80).optional().nullable(),
  expectedSalaryLpa: z.number().min(0).max(500).optional().nullable(),
  noticePeriodDays: z.number().min(0).max(365).optional().nullable(),
  availability: z.string().trim().max(80).optional().nullable(),
  workPreference: z.string().trim().max(80).optional().nullable(),
  leadershipExperience: z.boolean().optional().nullable(),
  teamSize: z.number().min(0).max(10000).optional().nullable(),
  achievements: z.array(z.string().trim().min(1).max(300)).max(20).optional().default([]),
  summary: z.string().trim().max(2000).optional().nullable(),
  resumeFreshness: z.string().trim().max(40).optional().nullable(),
  profileFreshness: z.string().trim().max(40).optional().nullable(),
  missingFields: z.array(z.string().trim().min(1).max(80)).max(30).optional().default([]),
  fieldConfidence: z.record(z.string(), z.number().min(0).max(1)).optional().default({}),
});

export type CandidateIntelligence = z.infer<typeof candidateIntelligenceSchema>;

export function emptyCandidateIntelligence(): CandidateIntelligence {
  return {
    name: null,
    email: null,
    phone: null,
    location: null,
    currentRole: null,
    currentCompany: null,
    previousCompanies: [],
    totalExperienceYears: null,
    skills: [],
    normalizedSkills: [],
    industries: [],
    education: [],
    certifications: [],
    expectedSalary: null,
    expectedSalaryLpa: null,
    noticePeriodDays: null,
    availability: null,
    workPreference: null,
    leadershipExperience: null,
    teamSize: null,
    achievements: [],
    summary: null,
    resumeFreshness: null,
    profileFreshness: null,
    missingFields: [],
    fieldConfidence: {},
  };
}

export function parseCandidateIntelligence(input: unknown): CandidateIntelligence {
  const parsed = candidateIntelligenceSchema.safeParse(input ?? {});
  if (!parsed.success) {
    throw Object.assign(new Error('Invalid candidate intelligence payload'), {
      status: 400,
      details: parsed.error.flatten(),
    });
  }
  return parsed.data;
}
