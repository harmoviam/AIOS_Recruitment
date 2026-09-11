import { buildSkillHaystack, matchSkillList } from '../skillMatch.js';
import type { MvpSourcingCriteria } from '../../dto/aiSourcing/mvpCriteria.js';

/**
 * MVP explainable candidate scorer (deterministic — no LLM per candidate).
 *
 * Default weights (configurable via `AI_SOURCING_SCORING_WEIGHTS` JSON):
 *   skills 50 / experience 20 / location 15 / notice 10 / salary 5
 *
 * Fairness: scoring only consumes job-relevant signals (skills, experience,
 * location, notice, salary). The input type deliberately carries no protected
 * attributes, so they cannot influence the score.
 */

export type MvpScoreWeights = {
  skills: number;
  experience: number;
  location: number;
  notice: number;
  salary: number;
};

export const DEFAULT_MVP_SCORE_WEIGHTS: MvpScoreWeights = {
  skills: 50,
  experience: 20,
  location: 15,
  notice: 10,
  salary: 5,
};

const WEIGHT_KEYS: (keyof MvpScoreWeights)[] = ['skills', 'experience', 'location', 'notice', 'salary'];

/** Weights source of truth: code defaults, overridable with env JSON (normalized to sum 100). */
export function getMvpScoreWeights(): MvpScoreWeights {
  const weights: MvpScoreWeights = { ...DEFAULT_MVP_SCORE_WEIGHTS };
  const raw = process.env.AI_SOURCING_SCORING_WEIGHTS;
  if (!raw) return weights;
  try {
    const parsed = JSON.parse(raw) as Partial<Record<keyof MvpScoreWeights, unknown>>;
    for (const key of WEIGHT_KEYS) {
      const v = parsed[key];
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100) weights[key] = v;
    }
  } catch {
    return { ...DEFAULT_MVP_SCORE_WEIGHTS };
  }
  const sum = WEIGHT_KEYS.reduce((acc, k) => acc + weights[k], 0);
  if (sum <= 0) return { ...DEFAULT_MVP_SCORE_WEIGHTS };
  for (const key of WEIGHT_KEYS) weights[key] = (weights[key] / sum) * 100;
  return weights;
}

/** Job-relevant candidate signals only — no protected attributes. */
export type MvpCandidateSignals = {
  skills?: unknown;
  technicalSkills?: unknown;
  softSkills?: unknown;
  resumeText?: string | null;
  experienceYears?: number | null;
  currentLocation?: string | null;
  preferredLocation?: string | null;
  jobCity?: string | null;
  jobTitle?: string | null;
  noticePeriod?: string | null;
  salaryExpectation?: string | null;
};

export type MvpScoreBreakdown = {
  skills: number;
  experience: number;
  location: number;
  notice: number;
  salary: number | null;
};

export type MvpCandidateScore = {
  matchScore: number;
  scoreBreakdown: MvpScoreBreakdown;
  /** True when the salary component was ignored (no constraint or no salary data) and other weights were scaled to 100. */
  salaryRedistributed: boolean;
  matchedRequiredSkills: string[];
  missingRequiredSkills: string[];
  matchedPreferredSkills: string[];
};

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

/** Parse notice text to days; "Immediate" style values count as 0. Null when unknown. */
export function parseMvpNoticeDays(value: string | null | undefined): number | null {
  if (!value) return null;
  if (/immediate|immediately|can\s+join|available\s+(right\s+)?now|serving|asap/i.test(value)) return 0;
  const m = value.match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

/**
 * Parse a salary expectation to LPA. Values >= 500 are treated as absolute
 * annual rupees (consistent with the search salary filter), e.g. 700000 → 7.
 */
export function parseMvpSalaryLpa(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = value.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 500 ? n / 100000 : n;
}

function normalizePlace(value: string | null | undefined): string {
  const v = (value || '').trim().toLowerCase();
  if (v === 'bengaluru') return 'bangalore';
  return v;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function scoreExperience(
  weight: number,
  exp: number | null | undefined,
  min: number | null,
  max: number | null
): number {
  if (min == null && max == null) return weight;
  if (exp == null || exp < 0) return 0;
  if (min != null && max != null) {
    if (exp >= min && exp <= max) return weight;
    if (exp < min) return weight * clamp01(min === 0 ? 1 : exp / min);
    return weight * clamp01(max / exp);
  }
  if (min != null) {
    return exp >= min ? weight : weight * clamp01(min === 0 ? 1 : exp / min);
  }
  // max only
  return exp <= (max as number) ? weight : weight * clamp01((max as number) / exp);
}

function scoreLocation(weight: number, locations: string[], candidatePlaces: string[]): number {
  if (locations.length === 0) return weight;
  const wanted = locations.map(normalizePlace).filter(Boolean);
  const have = candidatePlaces.map(normalizePlace).filter(Boolean);
  if (wanted.length === 0) return weight;
  if (have.length === 0) return 0;
  for (const w of wanted) {
    for (const h of have) {
      if (w === h || w.includes(h) || h.includes(w)) return weight;
    }
  }
  return 0;
}

function scoreNotice(weight: number, maxDays: number | null, candidateDays: number | null): number {
  if (maxDays == null) return weight;
  // Unknown notice is treated as immediately available — same generosity as the
  // search filter, which includes blank/unparsed notice under a notice cap.
  const days = candidateDays ?? 0;
  if (days <= maxDays) return weight;
  return weight * clamp01(maxDays / days);
}

/**
 * Score one candidate against MVP criteria. Candidates are never excluded for
 * a missing skill — the skills component simply scores lower.
 */
export function scoreCandidate(
  mvp: MvpSourcingCriteria,
  candidate: MvpCandidateSignals,
  weights: MvpScoreWeights = getMvpScoreWeights()
): MvpCandidateScore {
  const haystack = buildSkillHaystack([
    JSON.stringify(asStringArray(candidate.skills)),
    JSON.stringify(asStringArray(candidate.technicalSkills)),
    JSON.stringify(asStringArray(candidate.softSkills)),
    candidate.resumeText ?? '',
  ]);

  const required = matchSkillList(mvp.requiredSkills, haystack);
  const preferred = matchSkillList(mvp.preferredSkills, haystack);

  const skillsScore =
    mvp.requiredSkills.length > 0
      ? weights.skills * required.rate
      : mvp.preferredSkills.length > 0
        ? weights.skills * preferred.rate
        : weights.skills;

  const experienceScore = scoreExperience(
    weights.experience,
    candidate.experienceYears ?? null,
    mvp.experienceMin ?? null,
    mvp.experienceMax ?? null
  );
  const locationScore = scoreLocation(weights.location, mvp.locations, [
    candidate.currentLocation ?? '',
    candidate.preferredLocation ?? '',
    candidate.jobCity ?? '',
  ]);
  const noticeScore = scoreNotice(
    weights.notice,
    mvp.noticePeriodMaxDays ?? null,
    parseMvpNoticeDays(candidate.noticePeriod)
  );

  const hasSalaryConstraint = mvp.salaryMinLpa != null || mvp.salaryMaxLpa != null;
  const salaryLpa = parseMvpSalaryLpa(candidate.salaryExpectation);
  let salaryScore: number | null = null;
  if (hasSalaryConstraint && salaryLpa != null) {
    const okMin = mvp.salaryMinLpa == null || salaryLpa >= mvp.salaryMinLpa;
    const okMax = mvp.salaryMaxLpa == null || salaryLpa <= mvp.salaryMaxLpa;
    salaryScore = okMin && okMax ? weights.salary : 0;
  }

  const breakdown: MvpScoreBreakdown = {
    skills: Math.round(skillsScore),
    experience: Math.round(experienceScore),
    location: Math.round(locationScore),
    notice: Math.round(noticeScore),
    salary: salaryScore == null ? null : Math.round(salaryScore),
  };

  let total: number;
  let salaryRedistributed = false;
  if (salaryScore == null) {
    // Ignore the salary component and scale the rest to a 0–100 scale.
    const rest = 100 - weights.salary;
    total = rest > 0 ? ((breakdown.skills + breakdown.experience + breakdown.location + breakdown.notice) / rest) * 100 : 0;
    salaryRedistributed = true;
  } else {
    total = breakdown.skills + breakdown.experience + breakdown.location + breakdown.notice + Math.round(salaryScore);
  }

  return {
    matchScore: Math.min(100, Math.max(0, Math.round(total))),
    scoreBreakdown: breakdown,
    salaryRedistributed,
    matchedRequiredSkills: required.matched,
    missingRequiredSkills: required.missing,
    matchedPreferredSkills: preferred.matched,
  };
}
