import { pool } from '../dbConfig.js';
import {
  EXPERIENCE_BAND_LABELS,
  experienceBand,
  industryProfile,
  normalizeIndustry,
  type ExperienceBand,
} from './industries.js';

/**
 * Red-flag probes for the first 5–7 minutes of a screening call.
 *
 * This is a fixed, standard set — no AI, no per-call variation. The wording is
 * specialised by role title, experience band, and sector so the recruiter can
 * decide, before spending time on JD questions, whether the candidate actually
 * intends to take the job.
 *
 * The ids match the `screening` JSONB columns already scored on the candidate,
 * so existing scorecards keep working.
 */

/** Total budget for the red-flag block. */
export const RED_FLAG_DURATION_SECONDS = 420; // 7 minutes

export type RedFlagSignalId =
  | 'low_energy'
  | 'vague_motivation'
  | 'uncertain_joining_timeline'
  | 'avoids_current_status'
  | 'salary_focus_early'
  | 'weak_communication'
  | 'non_committed_language';

export interface RedFlagQuestion {
  id: RedFlagSignalId;
  /** Short signal name shown as the row heading. */
  label: string;
  /** The question to read out verbatim. */
  ask: string;
  /** What a low-risk answer sounds like (score 4–5). */
  good_answer: string;
  /** What a high-risk answer sounds like (score 1–3). */
  red_answer: string;
  /** Scoring guidance shown under the label. */
  hint: string;
  time_seconds: number;
}

export interface SalaryAlignment {
  /** Candidate's expectation, as entered. */
  expectation: string | null;
  /** Top of the job's advertised band, as entered. */
  job_max: string | null;
  /** Expectation as a share of the job maximum (1 = exactly at the ceiling). */
  ratio: number | null;
  level: 'ok' | 'tight' | 'over_budget' | 'unknown';
  message: string;
}

export interface RedFlagPack {
  job_id: number | null;
  job_title: string | null;
  industry: string | null;
  experience_band: ExperienceBand;
  experience_band_label: string;
  questions: RedFlagQuestion[];
  salary_alignment: SalaryAlignment;
  duration_seconds: number;
  total_seconds: number;
}

/**
 * Parse an Indian-style pay string into a rupees-per-year number.
 * Handles "4.2 LPA", "3-5 LPA", "₹4,20,000", "25k per month", "450000".
 * For ranges the upper bound is returned.
 */
export function parseSalaryToAnnual(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const text = String(raw).toLowerCase().replace(/,/g, '').trim();
  if (!text) return null;

  const monthly = /(per\s*month|p\.?m\.?\b|\/\s*month|monthly)/.test(text);
  const numbers = text.match(/\d+(?:\.\d+)?/g);
  if (!numbers?.length) return null;

  // Ranges ("3-5 LPA") are judged on the top of the range.
  const value = Math.max(...numbers.map(Number));
  if (!Number.isFinite(value) || value <= 0) return null;

  let annual: number;
  if (/lpa|lakh|lac/.test(text)) {
    annual = value * 100_000;
  } else if (/\bcr\b|crore/.test(text)) {
    annual = value * 10_000_000;
  } else if (/\d\s*k\b/.test(text)) {
    annual = value * 1_000 * (monthly ? 12 : 1);
  } else {
    annual = value * (monthly ? 12 : 1);
  }

  // A bare small number is almost always lakhs per annum ("expecting 6").
  if (annual < 1000) annual = value * 100_000;
  return annual;
}

/**
 * Compare what the candidate wants against the top of the job's band.
 * A candidate already at or above the ceiling rarely turns up for the
 * interview, so the recruiter needs to see this before anything else.
 */
export function assessSalaryAlignment(
  expectationRaw: string | null | undefined,
  jobSalaryRaw: string | null | undefined
): SalaryAlignment {
  const expectation = expectationRaw?.trim() || null;
  const jobMax = jobSalaryRaw?.trim() || null;
  const wanted = parseSalaryToAnnual(expectation);
  const budget = parseSalaryToAnnual(jobMax);

  if (wanted == null || budget == null || budget === 0) {
    return {
      expectation,
      job_max: jobMax,
      ratio: null,
      level: 'unknown',
      message: expectation
        ? 'Job budget not recorded — confirm the offered range against their expectation before booking an interview.'
        : 'Salary expectation not captured yet — ask for it in the first 2 minutes.',
    };
  }

  const ratio = wanted / budget;
  if (ratio > 1) {
    return {
      expectation,
      job_max: jobMax,
      ratio,
      level: 'over_budget',
      message: `Expectation (${expectation}) is above the job maximum (${jobMax}). High no-show risk — confirm they will accept the offered range before scheduling.`,
    };
  }
  if (ratio >= 0.9) {
    return {
      expectation,
      job_max: jobMax,
      ratio,
      level: 'tight',
      message: `Expectation (${expectation}) is within 10% of the job maximum (${jobMax}). There is almost no room to negotiate — get an explicit yes on the offered range now.`,
    };
  }
  return {
    expectation,
    job_max: jobMax,
    ratio,
    level: 'ok',
    message: `Expectation (${expectation}) sits comfortably inside the job range (up to ${jobMax}).`,
  };
}

/** Motivation probe, worded for the experience level. */
const MOTIVATION_ASK: Record<ExperienceBand, (title: string) => string> = {
  fresher: (title) => `Why do you want to start your career as a ${title}?`,
  junior: (title) => `You have a couple of years in already — why move to a ${title} role now?`,
  mid: (title) => `Why are you looking to change, and why this ${title} role specifically?`,
  senior: (title) => `At your level, what makes this ${title} role worth a move?`,
};

const MOTIVATION_GOOD: Record<ExperienceBand, string> = {
  fresher: 'Names the work itself, the training on offer, or a specific skill they want to build.',
  junior: 'Points to concrete gaps in the current job this role fixes — scope, tech, or growth.',
  mid: 'Clear, specific reason to leave plus what this role gives them that the current one does not.',
  senior: 'Talks about ownership, scope, or team — not just money or title.',
};

export function buildRedFlagQuestions(params: {
  jobTitle: string | null;
  industry: string | null;
  experienceYears: number | null;
  minExperience?: number | null;
  maxExperience?: number | null;
  salaryAlignment: SalaryAlignment;
}): RedFlagQuestion[] {
  const title = params.jobTitle?.trim() || 'this role';
  const industry = normalizeIndustry(params.industry);
  const profile = industryProfile(params.industry);
  const band = experienceBand(params.experienceYears);
  const isFresher = band === 'fresher';

  const salaryAsk =
    params.salaryAlignment.level === 'over_budget' || params.salaryAlignment.level === 'tight'
      ? `This role pays up to ${params.salaryAlignment.job_max}. You have asked for ${params.salaryAlignment.expectation} — will you accept the offered range?`
      : 'What are you expecting on salary, and how did you arrive at that number?';

  return [
    {
      id: 'vague_motivation',
      label: 'Motivation for the role',
      ask: MOTIVATION_ASK[band](title),
      good_answer: MOTIVATION_GOOD[band],
      red_answer:
        '"Just looking for a job", "someone told me to apply", "trying my luck", or cannot name anything about the role.',
      hint: 'Score 1–3 if the reason is generic; 4–5 if it is specific to this role.',
      time_seconds: 60,
    },
    {
      id: 'uncertain_joining_timeline',
      label: 'Joining timeline',
      ask: 'If we select you this week, how soon can you join?',
      good_answer: 'A firm date or a definite number of days, stated without hedging.',
      red_answer: '"Maybe next month", "let\'s see", "depends on a few things", or the answer changes when pressed.',
      hint: 'Score 1–3 for any vague or shifting date; 4–5 for a committed date.',
      time_seconds: 60,
    },
    {
      id: 'avoids_current_status',
      label: 'Current status & notice period',
      ask: isFresher
        ? 'Are you studying, working anywhere right now, or fully free to join?'
        : 'Are you currently working? Have you resigned, and are you serving your notice period?',
      good_answer: isFresher
        ? 'States clearly whether they are still studying, and when results/clearance come through.'
        : 'States employer, whether resignation is submitted, notice length, and last working day.',
      red_answer:
        'Hesitates, gives a different answer than the resume, or dodges whether they have actually resigned.',
      hint: 'Score 1–3 if the current status is unclear or inconsistent with the resume.',
      time_seconds: 60,
    },
    {
      id: 'non_committed_language',
      label: 'Offers in hand & competing processes',
      ask: 'Do you have any offer in hand, or other interviews in process right now?',
      good_answer:
        'Answers openly — names how many processes, at what stage, and why this role is still their preference.',
      red_answer:
        'Denies it and then contradicts themselves, or has an offer already and uses "maybe", "try", "hopefully" about joining here.',
      hint: `Score 1–3 for competing offers with no clear preference for this role. Common drop-out drivers here: ${profile.attritionDrivers.join(', ')}.`,
      time_seconds: 60,
    },
    {
      id: 'salary_focus_early',
      label: 'Salary alignment',
      ask: salaryAsk,
      good_answer:
        'Gives a range that fits the posted band, and asks about the role before asking about pay.',
      red_answer:
        'Asks "what is the salary?" in the first minute, or is at/above the ceiling and will not commit to the offered range.',
      hint: params.salaryAlignment.message,
      time_seconds: 60,
    },
    {
      id: 'low_energy',
      label: 'Energy & interest',
      ask: industry
        ? `What do you already know about working in ${industry}, and what would you want to ask us about this role?`
        : 'What do you already know about this role, and what would you want to ask us about it?',
      good_answer: 'Asks real questions about the work, the team, or growth. Sounds engaged.',
      red_answer: 'Very short answers, no curiosity about the role, sounds distracted or is multitasking.',
      hint: 'Observational — score on how they answer, not just what they say.',
      time_seconds: 60,
    },
    {
      id: 'weak_communication',
      label: 'Communication',
      ask: industry
        ? `${profile.logisticsPrompt} Walk me through how a normal working day would look for you.`
        : 'Walk me through how a normal working day would look for you in this role.',
      good_answer:
        'Structured, audible, easy to follow; confirms the shift, travel, and location realities without being pushed.',
      red_answer: 'One-word answers, long pauses, asks no questions, or cannot be understood on the call.',
      hint: `Judge against the level expected for ${EXPERIENCE_BAND_LABELS[band]}${industry ? ` in ${industry}` : ''}.`,
      time_seconds: 60,
    },
  ];
}

/**
 * Assemble the red-flag pack for one candidate from their assigned job.
 * Fully deterministic — safe to call on every page load.
 */
export async function getRedFlagPackForCandidate(
  candidateId: number,
  tenantId: number
): Promise<RedFlagPack> {
  const { rows } = await pool.query(
    `SELECT c.experience_years, c.salary_expectation, c.job_id,
            j.title AS job_title, j.industry, j.salary AS job_salary,
            j.min_experience, j.max_experience
     FROM candidates c
     LEFT JOIN jobs j ON j.id = c.job_id AND j.tenant_id = c.tenant_id
     WHERE c.id = $1 AND c.tenant_id = $2`,
    [candidateId, tenantId]
  );
  const row = rows[0];
  if (!row) throw new Error('Candidate not found');

  const salaryAlignment = assessSalaryAlignment(row.salary_expectation, row.job_salary);
  const questions = buildRedFlagQuestions({
    jobTitle: row.job_title,
    industry: row.industry,
    experienceYears: row.experience_years != null ? Number(row.experience_years) : null,
    minExperience: row.min_experience,
    maxExperience: row.max_experience,
    salaryAlignment,
  });
  const band = experienceBand(row.experience_years != null ? Number(row.experience_years) : null);

  return {
    job_id: row.job_id ?? null,
    job_title: row.job_title ?? null,
    industry: normalizeIndustry(row.industry),
    experience_band: band,
    experience_band_label: EXPERIENCE_BAND_LABELS[band],
    questions,
    salary_alignment: salaryAlignment,
    duration_seconds: RED_FLAG_DURATION_SECONDS,
    total_seconds: questions.reduce((sum, q) => sum + q.time_seconds, 0),
  };
}
