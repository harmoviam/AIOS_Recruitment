import type { ParsedExperience, ParsedProfile } from './ai.js';

/**
 * Compare claimed YOE (summary / header text) against employment-history spans.
 * Flags when both are present and diverge beyond a tolerance.
 */

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const CLAIMED_YEARS_RE =
  /(\d{1,2}(?:\.\d)?)\+?\s*(?:years?|yrs?)(?:\s+of)?(?:\s+(?:relevant\s+)?experience|\s+exp\.?)?/i;

/** Default allowed gap between claimed and employment-derived YOE (years). */
export const EXPERIENCE_MISMATCH_TOLERANCE_YEARS = 1;

export interface EmploymentSpan {
  title: string;
  company: string;
  start_date: string | null;
  end_date: string | null;
  /** Duration of this role in years (null if dates could not be parsed). */
  years: number | null;
}

export interface ExperienceConsistencyResult {
  /** Sum of each role's duration (can exceed calendar years if roles overlap). */
  employment_years_sum: number | null;
  /** Merged calendar years across all roles (overlaps counted once). */
  employment_years: number | null;
  /** Explicit YOE claim from summary / top-of-resume text. */
  claimed_years: number | null;
  /** Prefer employment calendar years, else claimed. */
  effective_years: number | null;
  roles: EmploymentSpan[];
  /** True when both claimed and employment years exist and differ beyond tolerance. */
  mismatch: boolean;
  mismatch_delta: number | null;
  reason: string | null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function parseExperienceDate(
  token: string | null | undefined,
  now: Date = new Date()
): Date | null {
  if (!token?.trim()) return null;
  const raw = token.trim();
  if (/^(present|current|now|ongoing|till\s*date|to\s*date)$/i.test(raw)) {
    return now;
  }

  const monthYear = raw.match(
    /^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{4})$/i
  );
  if (monthYear) {
    const month = MONTHS[monthYear[1].toLowerCase().slice(0, 3)] ?? 1;
    const year = Number(monthYear[2]);
    if (year >= 1970 && year <= now.getFullYear() + 1) {
      return new Date(year, month - 1, 1);
    }
  }

  const yearOnly = raw.match(/^(19|20)\d{2}$/);
  if (yearOnly) {
    return new Date(Number(raw), 0, 1);
  }

  // Fallback: first year in the string
  const anyYear = raw.match(/(19|20)\d{2}/);
  if (anyYear) {
    return new Date(Number(anyYear[0]), 0, 1);
  }
  return null;
}

function daysToYears(days: number): number {
  return round1(Math.max(0, days) / 365.25);
}

function roleYears(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  return daysToYears(ms / (1000 * 60 * 60 * 24));
}

/** Merge overlapping [start, end] intervals; return total days. */
function mergedDays(intervals: Array<{ start: Date; end: Date }>): number {
  if (intervals.length === 0) return 0;
  const sorted = [...intervals].sort((a, b) => a.start.getTime() - b.start.getTime());
  let total = 0;
  let curStart = sorted[0].start.getTime();
  let curEnd = sorted[0].end.getTime();
  for (let i = 1; i < sorted.length; i++) {
    const s = sorted[i].start.getTime();
    const e = sorted[i].end.getTime();
    if (s <= curEnd) {
      curEnd = Math.max(curEnd, e);
    } else {
      total += (curEnd - curStart) / (1000 * 60 * 60 * 24);
      curStart = s;
      curEnd = e;
    }
  }
  total += (curEnd - curStart) / (1000 * 60 * 60 * 24);
  return total;
}

/**
 * Pull an explicit YOE claim from summary / header text.
 * Skips education-style phrases like "4 years of Bachelor's".
 */
export function extractClaimedExperienceYears(
  text: string | null | undefined,
  summary?: string | null
): number | null {
  const blobs = [summary || '', (text || '').slice(0, 2500)].filter(Boolean);
  for (const blob of blobs) {
    const m = CLAIMED_YEARS_RE.exec(blob);
    if (!m) continue;
    const around = blob.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40).toLowerCase();
    if (
      /bachelor|master|degree|cgpa|gpa|university|college|school|diploma|graduation/.test(around)
    ) {
      continue;
    }
    const years = Number(m[1]);
    if (Number.isFinite(years) && years >= 0 && years <= 50) {
      return round1(years);
    }
  }
  return null;
}

export function analyzeExperienceConsistency(input: {
  profile: Pick<ParsedProfile, 'experience' | 'professional_summary' | 'total_experience_years'>;
  resumeText?: string | null;
  toleranceYears?: number;
  now?: Date;
}): ExperienceConsistencyResult {
  const now = input.now ?? new Date();
  const tolerance = input.toleranceYears ?? EXPERIENCE_MISMATCH_TOLERANCE_YEARS;
  const roles: EmploymentSpan[] = [];
  const intervals: Array<{ start: Date; end: Date }> = [];
  let sumYears = 0;
  let anyParsed = false;

  for (const exp of input.profile.experience || []) {
    const start = parseExperienceDate(exp.start_date, now);
    const end = parseExperienceDate(exp.end_date, now);
    let years: number | null = null;
    if (start && end && end >= start) {
      years = roleYears(start, end);
      sumYears += years;
      intervals.push({ start, end });
      anyParsed = true;
    }
    roles.push({
      title: exp.title || 'Unknown role',
      company: exp.company || '',
      start_date: exp.start_date ?? null,
      end_date: exp.end_date ?? null,
      years,
    });
  }

  const employment_years_sum = anyParsed ? round1(sumYears) : null;
  const employment_years = anyParsed ? daysToYears(mergedDays(intervals)) : null;

  const claimed_years = extractClaimedExperienceYears(
    input.resumeText,
    input.profile.professional_summary
  );

  const effective_years =
    employment_years != null
      ? employment_years
      : claimed_years != null
        ? claimed_years
        : input.profile.total_experience_years != null
          ? round1(Number(input.profile.total_experience_years))
          : null;

  let mismatch = false;
  let mismatch_delta: number | null = null;
  let reason: string | null = null;

  if (claimed_years != null && employment_years != null) {
    mismatch_delta = round1(Math.abs(claimed_years - employment_years));
    if (mismatch_delta > tolerance + 1e-9) {
      mismatch = true;
      reason =
        `Experience mismatch: summary claims ${claimed_years} years, ` +
        `but employment history totals ${employment_years} years` +
        (employment_years_sum != null &&
        Math.abs(employment_years_sum - employment_years) > 0.05
          ? ` (sum of roles ${employment_years_sum} yrs; overlaps adjusted)`
          : '');
    }
  }

  return {
    employment_years_sum,
    employment_years,
    claimed_years,
    effective_years,
    roles,
    mismatch,
    mismatch_delta,
    reason,
  };
}

/** Attach effective YOE onto a parsed profile when employment history is stronger. */
export function applyExperienceConsistencyToProfile(
  profile: ParsedProfile,
  resumeText?: string | null
): { profile: ParsedProfile; consistency: ExperienceConsistencyResult } {
  const consistency = analyzeExperienceConsistency({ profile, resumeText });
  const next: ParsedProfile = { ...profile };
  if (consistency.effective_years != null) {
    next.total_experience_years = consistency.effective_years;
  }
  return { profile: next, consistency };
}

/** Re-export for callers that only have experience rows. */
export function summarizeEmploymentYears(
  experience: ParsedExperience[] | null | undefined,
  now?: Date
): Pick<ExperienceConsistencyResult, 'employment_years' | 'employment_years_sum' | 'roles'> {
  const result = analyzeExperienceConsistency({
    profile: { experience: experience || [], professional_summary: null },
    now,
  });
  return {
    employment_years: result.employment_years,
    employment_years_sum: result.employment_years_sum,
    roles: result.roles,
  };
}
