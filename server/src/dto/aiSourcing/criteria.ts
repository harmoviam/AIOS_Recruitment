import { z } from 'zod';

/** Structured ATS candidate search criteria produced by the NL parser or UI edits. */
export const candidateSearchCriteriaSchema = z.object({
  skills: z.array(z.string().trim().min(1).max(64)).max(30).optional().default([]),
  preferredSkills: z.array(z.string().trim().min(1).max(64)).max(30).optional().default([]),
  keywords: z.array(z.string().trim().min(1).max(64)).max(30).optional().default([]),
  roles: z.array(z.string().trim().min(1).max(120)).max(10).optional().default([]),
  jobTitle: z.string().trim().max(120).optional().nullable(),
  location: z.string().trim().max(120).optional().nullable(),
  industries: z.array(z.string().trim().min(1).max(80)).max(15).optional().default([]),
  seniority: z.string().trim().max(40).optional().nullable(),
  minExperienceYears: z.number().min(0).max(50).optional().nullable(),
  maxExperienceYears: z.number().min(0).max(50).optional().nullable(),
  noticePeriodMaxDays: z.number().min(0).max(365).optional().nullable(),
  maxSalaryLpa: z.number().min(0).max(500).optional().nullable(),
  stage: z
    .enum(['applied', 'screening', 'interview', 'selected', 'rejected', 'joined'])
    .optional()
    .nullable(),
  minAiScore: z.number().min(0).max(10).optional().nullable(),
});

export type CandidateSearchCriteria = z.infer<typeof candidateSearchCriteriaSchema>;

export const fieldConfidenceSchema = z.record(z.string(), z.number().min(0).max(1));

export type FieldConfidence = z.infer<typeof fieldConfidenceSchema>;

export function emptyCriteria(): CandidateSearchCriteria {
  return {
    skills: [],
    preferredSkills: [],
    keywords: [],
    roles: [],
    jobTitle: null,
    location: null,
    industries: [],
    seniority: null,
    minExperienceYears: null,
    maxExperienceYears: null,
    noticePeriodMaxDays: null,
    maxSalaryLpa: null,
    stage: null,
    minAiScore: null,
  };
}

/** Soft-validate and clamp incoming criteria from the client. */
export function parseCriteria(input: unknown): CandidateSearchCriteria {
  const parsed = candidateSearchCriteriaSchema.safeParse(input ?? {});
  if (!parsed.success) {
    throw Object.assign(new Error('Invalid search criteria'), {
      status: 400,
      details: parsed.error.flatten(),
    });
  }
  const c = parsed.data;
  if (
    c.minExperienceYears != null &&
    c.maxExperienceYears != null &&
    c.minExperienceYears > c.maxExperienceYears
  ) {
    throw Object.assign(new Error('minExperienceYears cannot exceed maxExperienceYears'), {
      status: 400,
    });
  }
  return c;
}

export function criteriaHasSignal(c: CandidateSearchCriteria): boolean {
  return Boolean(
    (c.skills && c.skills.length) ||
      (c.preferredSkills && c.preferredSkills.length) ||
      (c.keywords && c.keywords.length) ||
      (c.roles && c.roles.length) ||
      (c.industries && c.industries.length) ||
      c.jobTitle ||
      c.location ||
      c.seniority ||
      c.minExperienceYears != null ||
      c.maxExperienceYears != null ||
      c.noticePeriodMaxDays != null ||
      c.maxSalaryLpa != null ||
      c.stage ||
      c.minAiScore != null
  );
}
