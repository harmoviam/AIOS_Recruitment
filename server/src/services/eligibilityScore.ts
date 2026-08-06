import type { ParsedProfile } from './ai.js';
import { buildSkillHaystack, matchSkillList } from './skillMatch.js';

/**
 * Deterministic eligibility score (0–10) from Mandatory + Preferred skill match.
 *
 * Formula: 0.7 × mandatoryMatchRate×10 + 0.3 × preferredMatchRate×10.
 * When Preferred is empty, Mandatory carries 100% of the weight.
 *
 * Skill matching uses exact/substring, alias synonyms, then core-token match
 * (see skillMatch.ts) so "Synapse" satisfies "Azure Synapse Analytics".
 */

export interface EligibilityScoreResult {
  score: number;
  mandatory_matched: string[];
  mandatory_missing: string[];
  preferred_matched: string[];
  preferred_missing: string[];
  mandatory_rate: number;
  preferred_rate: number;
}

export interface EligibilityJobContext {
  title?: string | null;
  description?: string | null;
  required_skills?: string[] | null;
  preferred_skills?: string[] | null;
}

/** Hard gate: candidate YOE vs job min_experience. Null/≤0 min means no gate. */
export interface ExperienceGateResult {
  passed: boolean;
  candidate_years: number;
  required_years: number | null;
  reason: string | null;
}

/**
 * Compare parsed total years of experience against the job minimum.
 * When the job has no min (null/undefined/≤0), the gate always passes.
 * Missing/unknown candidate YOE is treated as 0.
 */
export function evaluateExperienceGate(
  candidateYears: number | null | undefined,
  minExperience: number | null | undefined
): ExperienceGateResult {
  const years =
    candidateYears != null && Number.isFinite(Number(candidateYears))
      ? Math.max(0, Number(candidateYears))
      : 0;
  const required =
    minExperience != null && Number.isFinite(Number(minExperience))
      ? Number(minExperience)
      : null;

  if (required == null || required <= 0) {
    return {
      passed: true,
      candidate_years: years,
      required_years: required,
      reason: null,
    };
  }

  if (years + 1e-9 >= required) {
    return {
      passed: true,
      candidate_years: years,
      required_years: required,
      reason: null,
    };
  }

  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  return {
    passed: false,
    candidate_years: years,
    required_years: required,
    reason: `Insufficient experience: ${fmt(years)} years (required: ${fmt(required)}+)`,
  };
}

function skillList(profile: ParsedProfile): string[] {
  const all = [
    ...(profile.skills || []),
    ...(profile.technical_skills || []),
    ...(profile.soft_skills || []),
  ];
  return [...new Set(all.map((s) => String(s).trim()).filter(Boolean))];
}

function matchSkills(
  required: string[],
  candidateSkills: string[],
  resumeText: string
): { matched: string[]; missing: string[]; rate: number } {
  const haystack = buildSkillHaystack([...candidateSkills, resumeText.slice(0, 20_000)]);
  const result = matchSkillList(required, haystack);
  return { matched: result.matched, missing: result.missing, rate: result.rate };
}

export function computeEligibilityScore(
  profile: ParsedProfile,
  resumeText: string,
  job: EligibilityJobContext | null | undefined
): EligibilityScoreResult {
  const mandatory = (job?.required_skills || []).map(String).filter((s) => s.trim());
  const preferred = (job?.preferred_skills || []).map(String).filter((s) => s.trim());
  const skills = skillList(profile);

  const mand = matchSkills(mandatory, skills, resumeText);
  const pref = matchSkills(preferred, skills, resumeText);

  let score: number;
  if (preferred.length === 0) {
    score = mand.rate * 10;
  } else if (mandatory.length === 0) {
    score = pref.rate * 10;
  } else {
    score = 0.7 * mand.rate * 10 + 0.3 * pref.rate * 10;
  }
  score = Math.round(Math.min(10, Math.max(0, score)) * 10) / 10;

  return {
    score,
    mandatory_matched: mand.matched,
    mandatory_missing: mand.missing,
    preferred_matched: pref.matched,
    preferred_missing: pref.missing,
    mandatory_rate: Math.round(mand.rate * 1000) / 1000,
    preferred_rate: Math.round(pref.rate * 1000) / 1000,
  };
}

/** Apply an AI nudge of at most ±1.0 without leaving 0–10. */
export function applyEligibilityNudge(baseScore: number, nudged: number | null | undefined): number {
  if (nudged == null || !Number.isFinite(nudged)) return baseScore;
  const clampedNudge = Math.min(baseScore + 1, Math.max(baseScore - 1, nudged));
  return Math.round(Math.min(10, Math.max(0, clampedNudge)) * 10) / 10;
}
