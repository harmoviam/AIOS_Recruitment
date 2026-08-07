import { z } from 'zod';

/** Structured ATS candidate search criteria produced by the NL parser or UI edits. */
export const candidateSearchCriteriaSchema = z.object({
  skills: z.array(z.string().trim().min(1).max(64)).max(30).optional().default([]),
  keywords: z.array(z.string().trim().min(1).max(64)).max(30).optional().default([]),
  jobTitle: z.string().trim().max(120).optional().nullable(),
  location: z.string().trim().max(120).optional().nullable(),
  minExperienceYears: z.number().min(0).max(50).optional().nullable(),
  maxExperienceYears: z.number().min(0).max(50).optional().nullable(),
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
    keywords: [],
    jobTitle: null,
    location: null,
    minExperienceYears: null,
    maxExperienceYears: null,
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
      (c.keywords && c.keywords.length) ||
      c.jobTitle ||
      c.location ||
      c.minExperienceYears != null ||
      c.maxExperienceYears != null ||
      c.stage ||
      c.minAiScore != null
  );
}
