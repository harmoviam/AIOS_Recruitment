import { z } from 'zod';
import { CITY_LEXICON } from '../../services/aiSourcing/heuristicParser.js';
import type { CandidateSearchCriteria } from './criteria.js';

/**
 * MVP sourcing criteria — the small, reviewable contract used by the
 * AI Sourcer flow: Job Description → criteria → search → score → shortlist.
 *
 * This intentionally stays narrower than the full-text `CandidateSearchCriteria`
 * (no pipeline stages, industries, seniority, or free keywords). The existing
 * parser/JD-intelligence modules keep producing `CandidateSearchCriteria`;
 * this adapter maps that output onto the MVP shape.
 */
export const mvpSourcingCriteriaSchema = z.object({
  jobTitle: z.string().trim().max(120).optional().nullable(),
  requiredSkills: z.array(z.string().trim().min(1).max(64)).max(30).optional().default([]),
  preferredSkills: z.array(z.string().trim().min(1).max(64)).max(30).optional().default([]),
  experienceMin: z.number().min(0).max(50).optional().nullable(),
  experienceMax: z.number().min(0).max(50).optional().nullable(),
  locations: z.array(z.string().trim().min(1).max(80)).max(10).optional().default([]),
  noticePeriodMaxDays: z.number().min(0).max(365).optional().nullable(),
  salaryMinLpa: z.number().min(0).max(1000).optional().nullable(),
  salaryMaxLpa: z.number().min(0).max(1000).optional().nullable(),
});

export type MvpSourcingCriteria = z.infer<typeof mvpSourcingCriteriaSchema>;

export function emptyMvpCriteria(): MvpSourcingCriteria {
  return {
    jobTitle: null,
    requiredSkills: [],
    preferredSkills: [],
    experienceMin: null,
    experienceMax: null,
    locations: [],
    noticePeriodMaxDays: null,
    salaryMinLpa: null,
    salaryMaxLpa: null,
  };
}

/** Validate MVP criteria; throws a 400-style error like `parseCriteria`. */
export function parseMvpCriteria(input: unknown): MvpSourcingCriteria {
  const parsed = mvpSourcingCriteriaSchema.safeParse(input ?? {});
  if (!parsed.success) {
    throw Object.assign(new Error('Invalid sourcing criteria'), {
      status: 400,
      details: parsed.error.flatten(),
    });
  }
  const c = parsed.data;
  if (c.experienceMin != null && c.experienceMax != null && c.experienceMin > c.experienceMax) {
    throw Object.assign(new Error('experienceMin cannot exceed experienceMax'), { status: 400 });
  }
  if (c.salaryMinLpa != null && c.salaryMaxLpa != null && c.salaryMinLpa > c.salaryMaxLpa) {
    throw Object.assign(new Error('salaryMinLpa cannot exceed salaryMaxLpa'), { status: 400 });
  }
  return c;
}

function normalizeCityName(value: string): string {
  const v = value.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!v) return '';
  if (v === 'bengaluru') return 'Bangalore';
  if (v === 'remote') return 'Remote';
  return v
    .split(' ')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function pushUnique(target: string[], value: string): void {
  const clean = value.trim();
  if (!clean) return;
  if (!target.some((t) => t.toLowerCase() === clean.toLowerCase())) target.push(clean);
}

/**
 * Build an MVP locations list from a single structured location plus the raw
 * requirement text. Handles "Chandigarh, Mohali or Remote" style inputs by
 * scanning for known cities in addition to splitting the explicit value.
 *
 * `skillTerms` guards against a known heuristic misfire where "experience in
 * AWS" is captured as location "AWS": an explicit part that is literally a
 * detected skill is dropped. Exported for unit tests.
 */
export function splitLocations(
  explicitLocation: string | null | undefined,
  rawText?: string | null,
  skillTerms: string[] = []
): string[] {
  const out: string[] = [];
  const skillSet = new Set(skillTerms.map((s) => s.trim().toLowerCase()).filter(Boolean));
  if (explicitLocation) {
    for (const part of explicitLocation.split(/[,;|/]|\bor\b/gi)) {
      const name = normalizeCityName(part);
      if (name && !skillSet.has(name.toLowerCase())) pushUnique(out, name);
    }
  }
  if (rawText) {
    const lower = rawText.toLowerCase();
    for (const city of CITY_LEXICON) {
      if (lower.includes(city)) {
        const name = normalizeCityName(city);
        if (name) pushUnique(out, name);
      }
    }
  }
  return out.slice(0, 10);
}

export type SalaryRangeLpa = { min: number | null; max: number | null };

/**
 * Parse an LPA salary range such as "₹18–25 LPA", "18-25 lakh", or a single
 * cap such as "salary below 55 LPA". Returns nulls when nothing is stated.
 * Exported for unit tests.
 */
export function parseSalaryRangeLpa(text: string): SalaryRangeLpa {
  const range =
    text.match(/(\d+(?:\.\d+)?)\s*(?:-|–|—|to)\s*(\d+(?:\.\d+)?)\s*(?:lpa|lakh)/i) ||
    text.match(/(?:₹|rs\.?\s*)?(\d+(?:\.\d+)?)\s*(?:-|–|—|to)\s*(?:₹|rs\.?\s*)?(\d+(?:\.\d+)?)\s*(?:lpa|lakh)/i);
  if (range) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    return { min: Math.min(a, b), max: Math.max(a, b) };
  }
  const cap = text.match(
    /(?:salary|ctc|package|below|under|up\s+to|max(?:imum)?|less\s+than|<)\s*(?:₹|rs\.?\s*)?(\d+(?:\.\d+)?)\s*(?:lpa|lakh)/i
  );
  if (cap) return { min: null, max: Number(cap[1]) };
  return { min: null, max: null };
}

/**
 * Cue words that mark a clause as preferred/nice-to-have rather than required.
 * Mirrors the long-spec example where "AWS exposure" maps to a preferred skill.
 *
 * AFTER_CUES introduce preferred skills ("preferred Terraform"); BEFORE_CUES
 * follow the skill they modify ("AWS exposure").
 */
const AFTER_CUES = [
  'preferred',
  'preference',
  'nice to have',
  'nice-to-have',
  'good to have',
  'bonus',
  'plus',
  'optional',
  'add-on',
  'addon',
];
const BEFORE_CUES = ['exposure'];

function scopeAfterCue(lower: string, idx: number): string {
  return lower.slice(idx, idx + 160).split(/[.;\n]/, 1)[0] || '';
}

function scopeBeforeCue(lower: string, idx: number): string {
  // Last comma/and-separated segment before the cue: "Kafka, AWS exposure" → "aws".
  const before = lower.slice(Math.max(0, idx - 80), idx);
  const lastComma = before.split(/[,;]/).pop() ?? '';
  const lastAnd = lastComma.split(/\band\b/).pop() ?? '';
  return lastAnd.trim();
}

/**
 * Find required skills mentioned inside a preferred-skill cue clause so the
 * caller can demote them to preferred. Exported for unit tests.
 */
export function extractPreferredSkillNames(rawText: string, skills: string[]): string[] {
  if (!rawText || skills.length === 0) return [];
  const lower = rawText.toLowerCase();
  const preferred = new Set<string>();
  const check = (scope: string) => {
    for (const skill of skills) {
      const needle = skill.trim().toLowerCase();
      if (needle && scope.includes(needle)) preferred.add(skill);
    }
  };
  for (const cue of AFTER_CUES) {
    let idx = lower.indexOf(cue);
    while (idx !== -1) {
      check(scopeAfterCue(lower, idx));
      idx = lower.indexOf(cue, idx + cue.length);
    }
  }
  for (const cue of BEFORE_CUES) {
    let idx = lower.indexOf(cue);
    while (idx !== -1) {
      check(scopeBeforeCue(lower, idx));
      idx = lower.indexOf(cue, idx + cue.length);
    }
  }
  return [...preferred];
}

function uniqCaseInsensitive(items: string[]): string[] {
  const out: string[] = [];
  for (const raw of items) {
    const v = raw.trim();
    if (!v) continue;
    if (!out.some((t) => t.toLowerCase() === v.toLowerCase())) out.push(v);
  }
  return out;
}

export type ToMvpCriteriaInput = {
  criteria: CandidateSearchCriteria;
  /** Raw JD / recruiter query — used for multi-location, salary-range, and preferred-cue refinement. */
  rawText?: string | null;
  /** Explicit job-level skills (e.g. jobs.required_skills / preferred_skills). Job-preferred wins ties. */
  jobRequiredSkills?: string[];
  jobPreferredSkills?: string[];
};

/**
 * Map parser/JD-intelligence output onto validated MVP sourcing criteria.
 * Preferred skills win when a skill appears in both lists; skills mentioned in
 * a preferred cue clause ("preferred", "nice to have", "exposure", …) are
 * demoted from required to preferred. Never rejects — missing fields stay null.
 */
export function toMvpCriteria(input: ToMvpCriteriaInput): MvpSourcingCriteria {
  const { criteria } = input;
  const rawText = input.rawText ?? '';
  const jobRequiredSkills = input.jobRequiredSkills ?? [];
  const jobPreferredSkills = input.jobPreferredSkills ?? [];

  let required = uniqCaseInsensitive([...criteria.skills, ...jobRequiredSkills]);
  let preferred = uniqCaseInsensitive([...criteria.preferredSkills, ...jobPreferredSkills]);

  const preferredNames = new Set(preferred.map((s) => s.toLowerCase()));
  for (const name of extractPreferredSkillNames(rawText, required)) {
    preferredNames.add(name.toLowerCase());
  }
  required = required.filter((s) => !preferredNames.has(s.toLowerCase()));
  for (const name of preferredNames) {
    if (!preferred.some((p) => p.toLowerCase() === name)) {
      const original =
        [...criteria.skills, ...jobRequiredSkills, ...preferred].find(
          (s) => s.toLowerCase() === name
        ) ?? name;
      preferred.push(original);
    }
  }
  preferred = uniqCaseInsensitive(preferred);

  const locations = splitLocations(criteria.location ?? null, rawText || undefined, [
    ...criteria.skills,
    ...criteria.preferredSkills,
    ...jobRequiredSkills,
    ...jobPreferredSkills,
  ]);
  const range = rawText ? parseSalaryRangeLpa(rawText) : { min: null, max: null };

  return parseMvpCriteria({
    ...emptyMvpCriteria(),
    jobTitle: criteria.jobTitle ?? null,
    requiredSkills: required.slice(0, 30),
    preferredSkills: preferred.slice(0, 30),
    experienceMin: criteria.minExperienceYears ?? null,
    experienceMax: criteria.maxExperienceYears ?? null,
    locations,
    noticePeriodMaxDays: criteria.noticePeriodMaxDays ?? null,
    salaryMinLpa: range.min,
    salaryMaxLpa: range.max ?? criteria.maxSalaryLpa ?? null,
  });
}

export type MvpCriteriaJson = {
  job_title: string | null;
  required_skills: string[];
  preferred_skills: string[];
  experience_min: number | null;
  experience_max: number | null;
  locations: string[];
  notice_period_max: number | null;
  salary_min: number | null;
  salary_max: number | null;
};

/** Snake-case JSON shape for MVP API responses (matches the MVP spec example). */
export function toMvpCriteriaJson(mvp: MvpSourcingCriteria): MvpCriteriaJson {
  return {
    job_title: mvp.jobTitle ?? null,
    required_skills: mvp.requiredSkills,
    preferred_skills: mvp.preferredSkills,
    experience_min: mvp.experienceMin ?? null,
    experience_max: mvp.experienceMax ?? null,
    locations: mvp.locations,
    notice_period_max: mvp.noticePeriodMaxDays ?? null,
    salary_min: mvp.salaryMinLpa ?? null,
    salary_max: mvp.salaryMaxLpa ?? null,
  };
}
