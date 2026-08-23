/**
 * Prompts for NL → CandidateSearchCriteria parsing.
 * Keep prompts out of controllers/routes.
 */

export const REQUIREMENT_PARSER_SYSTEM = `You extract structured ATS candidate-search criteria from a recruiter's natural-language request.
Only include values explicitly stated or strongly implied. Never invent skills, locations, or experience ranges.
Return JSON matching the schema. Skills are short lowercase terms (e.g. "react", "java", "voice process").
"5+ years" → minExperienceYears 5. "fresher" / "entry level" → maxExperienceYears 1.
Pipeline stages if mentioned must be one of: applied, screening, interview, selected, email_sent, ho_pending, rejected, joined.
jobTitle is a short role phrase when the recruiter names a role. location is a city/region string.
keywords are additional free-text terms useful for full-text search that are not skills.`;

export function requirementParserUserPrompt(query: string): string {
  return `Recruiter request:\n${query.slice(0, 1000)}`;
}

export const REQUIREMENT_PARSER_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    skills: { type: 'array', items: { type: 'string' } },
    keywords: { type: 'array', items: { type: 'string' } },
    jobTitle: { type: ['string', 'null'] },
    location: { type: ['string', 'null'] },
    minExperienceYears: { type: ['number', 'null'] },
    maxExperienceYears: { type: ['number', 'null'] },
    stage: {
      type: ['string', 'null'],
      enum: ['applied', 'screening', 'interview', 'selected', 'email_sent', 'ho_pending', 'rejected', 'joined', null],
    },
    minAiScore: { type: ['number', 'null'] },
    fieldConfidence: {
      type: 'object',
      additionalProperties: { type: 'number' },
    },
  },
  required: [],
} as const;
