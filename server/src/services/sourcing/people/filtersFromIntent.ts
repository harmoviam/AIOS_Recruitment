import type { PeopleSearchFilters, StructuredIntent } from '../../../types/sourcing.js';

/** Skills recognizable without an LLM; extend as new markets come online. */
const SKILL_KEYWORDS = [
  'react',
  'angular',
  'vue',
  'node.js',
  'node',
  'javascript',
  'typescript',
  'java',
  'python',
  'php',
  'flutter',
  'android',
  'ios',
  'sql',
  'aws',
  'azure',
  'devops',
  'kubernetes',
  'docker',
  'graphql',
  'mongodb',
  'spring boot',
  'customer support',
  'voice process',
  'telesales',
  'data entry',
];

const EXPERIENCE_RE = /(\d+)\s*\+?\s*(?:years?|yrs?)/i;
const SENIOR_RE = /\b(senior|sr\.?|lead|principal|staff)\b/i;
const JUNIOR_RE = /\b(junior|jr\.?|fresher|entry[- ]level|trainee)\b/i;

/**
 * Regex-only fallback mapping when the LLM is disabled or fails; the LLM
 * extraction (ai.ts extractPeopleSearchFilters) is merged over this.
 */
export function filtersFromIntent(
  intent: StructuredIntent | null,
  rawText: string
): PeopleSearchFilters {
  const filters: PeopleSearchFilters = { country: 'india' };
  const text = rawText.toLowerCase();

  if (intent?.cityName) filters.city = intent.cityName;
  if (intent?.roleName) filters.jobTitle = intent.roleName;

  const expMatch = EXPERIENCE_RE.exec(rawText);
  if (expMatch) {
    const years = Number(expMatch[1]);
    if (Number.isFinite(years) && years >= 0 && years <= 50) {
      filters.minExperienceYears = years;
    }
  }

  if (SENIOR_RE.test(rawText)) {
    filters.seniorityLevels = ['senior'];
  } else if (JUNIOR_RE.test(rawText)) {
    filters.seniorityLevels = ['entry', 'training'];
    if (filters.minExperienceYears === undefined) filters.maxExperienceYears = 1;
  }
  if (intent?.experienceHint?.toLowerCase() === 'fresher' && !filters.seniorityLevels) {
    filters.seniorityLevels = ['entry', 'training'];
    filters.maxExperienceYears = 1;
  }

  const skills = SKILL_KEYWORDS.filter((skill) => {
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`, 'i').test(text);
  });
  // "node" is a substring of "node.js" matches — dedupe to the canonical term.
  const deduped = skills.includes('node.js') ? skills.filter((s) => s !== 'node') : skills;
  if (deduped.length) filters.skills = deduped.map((s) => (s === 'node' ? 'node.js' : s));

  return filters;
}

/** Later sources win per-field; arrays replace, never concatenate. */
export function mergeFilters(
  ...sources: Array<Partial<PeopleSearchFilters> | null | undefined>
): PeopleSearchFilters {
  const merged: PeopleSearchFilters = {};
  for (const source of sources) {
    if (!source) continue;
    for (const [key, value] of Object.entries(source)) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value) && !value.length) continue;
      if (typeof value === 'string' && !value.trim()) continue;
      (merged as Record<string, unknown>)[key] = value;
    }
  }
  return merged;
}
