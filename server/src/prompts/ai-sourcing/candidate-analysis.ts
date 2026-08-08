/** Prompt version logged with candidate intelligence results. */
export const CANDIDATE_ANALYSIS_PROMPT_VERSION = 'candidate-analysis@1';

export const CANDIDATE_ANALYSIS_SYSTEM = `You are a recruitment resume intelligence engine for HarmiRecruit.
Build a structured candidate profile from resume text and existing parsed fields.
Never invent employers, certifications, or achievements not supported by the source.
Never overwrite or contradict explicit candidate-supplied contact fields when present.
Do not infer protected attributes. Return JSON only.`;

export function candidateAnalysisUserPrompt(input: {
  name?: string | null;
  resumeText?: string | null;
  parsedProfile?: unknown;
  skills?: unknown;
  experienceYears?: number | null;
  location?: string | null;
}): string {
  return `Normalize this candidate into an AI sourcing profile.

Known name: ${input.name || ''}
Known location: ${input.location || ''}
Known experience years: ${input.experienceYears ?? ''}
Known skills JSON: ${JSON.stringify(input.skills ?? [])}
Existing parsed_profile JSON: ${JSON.stringify(input.parsedProfile ?? {}).slice(0, 8000)}

Resume text (may be truncated):
${(input.resumeText || '').slice(0, 10000)}

Return JSON with keys:
name, email, phone, location, currentRole, currentCompany, previousCompanies[],
totalExperienceYears, skills[], industries[], education[], certifications[],
expectedSalary, expectedSalaryLpa, noticePeriodDays, availability, workPreference,
leadershipExperience, teamSize, achievements[], summary, missingFields[], fieldConfidence{}
(fieldConfidence values 0-1).`;
}
