import { z } from 'zod';

export const jobIntelligenceSchema = z.object({
  role: z.string().trim().max(160).optional().nullable(),
  roles: z.array(z.string().trim().min(1).max(120)).max(10).optional().default([]),
  seniority: z.string().trim().max(40).optional().nullable(),
  requiredSkills: z.array(z.string().trim().min(1).max(64)).max(40).optional().default([]),
  preferredSkills: z.array(z.string().trim().min(1).max(64)).max(40).optional().default([]),
  industries: z.array(z.string().trim().min(1).max(80)).max(15).optional().default([]),
  technicalCompetencies: z.array(z.string().trim().min(1).max(80)).max(30).optional().default([]),
  softSkills: z.array(z.string().trim().min(1).max(80)).max(20).optional().default([]),
  leadershipRequirements: z.array(z.string().trim().min(1).max(120)).max(15).optional().default([]),
  education: z.array(z.string().trim().min(1).max(120)).max(10).optional().default([]),
  certifications: z.array(z.string().trim().min(1).max(120)).max(15).optional().default([]),
  minExperienceYears: z.number().min(0).max(50).optional().nullable(),
  maxExperienceYears: z.number().min(0).max(50).optional().nullable(),
  location: z.string().trim().max(120).optional().nullable(),
  salaryBand: z.string().trim().max(80).optional().nullable(),
  maxSalaryLpa: z.number().min(0).max(500).optional().nullable(),
  noticePeriodMaxDays: z.number().min(0).max(365).optional().nullable(),
  domainExperience: z.array(z.string().trim().min(1).max(80)).max(15).optional().default([]),
  summary: z.string().trim().max(2000).optional().nullable(),
  fieldConfidence: z.record(z.string(), z.number().min(0).max(1)).optional().default({}),
});

export type JobIntelligence = z.infer<typeof jobIntelligenceSchema>;

export function emptyJobIntelligence(): JobIntelligence {
  return {
    role: null,
    roles: [],
    seniority: null,
    requiredSkills: [],
    preferredSkills: [],
    industries: [],
    technicalCompetencies: [],
    softSkills: [],
    leadershipRequirements: [],
    education: [],
    certifications: [],
    minExperienceYears: null,
    maxExperienceYears: null,
    location: null,
    salaryBand: null,
    maxSalaryLpa: null,
    noticePeriodMaxDays: null,
    domainExperience: [],
    summary: null,
    fieldConfidence: {},
  };
}

export function parseJobIntelligence(input: unknown): JobIntelligence {
  const parsed = jobIntelligenceSchema.safeParse(input ?? {});
  if (!parsed.success) {
    throw Object.assign(new Error('Invalid job intelligence payload'), {
      status: 400,
      details: parsed.error.flatten(),
    });
  }
  return parsed.data;
}
