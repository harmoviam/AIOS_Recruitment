/** Prompt version logged with JD intelligence results. */
export const JD_ANALYSIS_PROMPT_VERSION = 'jd-analysis@1';

export const JD_ANALYSIS_SYSTEM = `You are a recruitment JD intelligence engine for HarmiRecruit.
Extract structured hiring requirements from a job description.
Never invent requirements that are not supported by the text.
Do not use protected attributes (age, gender, caste, religion, race, disability, etc.) in outputs.
Return JSON only.`;

export function jdAnalysisUserPrompt(input: {
  title: string;
  description: string;
  requiredSkills?: unknown;
  preferredSkills?: unknown;
  industry?: string | null;
  location?: string | null;
  minExperience?: number | null;
  maxExperience?: number | null;
  salary?: string | null;
}): string {
  return `Analyze this job and extract structured intelligence.

Title: ${input.title}
Industry: ${input.industry || ''}
Location: ${input.location || ''}
Min experience: ${input.minExperience ?? ''}
Max experience: ${input.maxExperience ?? ''}
Salary field: ${input.salary || ''}
Required skills (existing): ${JSON.stringify(input.requiredSkills ?? [])}
Preferred skills (existing): ${JSON.stringify(input.preferredSkills ?? [])}

Description:
${input.description.slice(0, 12000)}

Return JSON with keys:
role, roles[], seniority, requiredSkills[], preferredSkills[], industries[],
technicalCompetencies[], softSkills[], leadershipRequirements[], education[],
certifications[], minExperienceYears, maxExperienceYears, location, salaryBand,
maxSalaryLpa, noticePeriodMaxDays, domainExperience[], summary, fieldConfidence{}
(fieldConfidence values 0-1).`;
}

export const JD_ANALYSIS_JSON_SCHEMA = {
  type: 'object',
  properties: {
    role: { type: ['string', 'null'] },
    roles: { type: 'array', items: { type: 'string' } },
    seniority: { type: ['string', 'null'] },
    requiredSkills: { type: 'array', items: { type: 'string' } },
    preferredSkills: { type: 'array', items: { type: 'string' } },
    industries: { type: 'array', items: { type: 'string' } },
    minExperienceYears: { type: ['number', 'null'] },
    maxExperienceYears: { type: ['number', 'null'] },
    location: { type: ['string', 'null'] },
    maxSalaryLpa: { type: ['number', 'null'] },
    noticePeriodMaxDays: { type: ['number', 'null'] },
    summary: { type: ['string', 'null'] },
    fieldConfidence: { type: 'object' },
  },
};
