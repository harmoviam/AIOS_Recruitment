import { pool } from '../dbConfig.js';
import {
  aiMode,
  generateScreeningQuestionsFromJd,
  type ScreeningQuestionsInput,
} from './ai.js';
import {
  EXPERIENCE_BAND_LABELS,
  experienceBand,
  industryProfile,
  normalizeIndustry,
  type ExperienceBand,
} from './industries.js';

export type InterviewQuestionCategory =
  | 'introduction'
  | 'technical'
  | 'domain'
  | 'behavioral'
  | 'goals';

/** First-call screening budget — ~5 minutes. */
export const SCREENING_DURATION_SECONDS = 300;
/** Scheduled interview question budget — ~15 minutes. */
export const SCHEDULED_DURATION_SECONDS = 900;

export interface ScreeningQuestionDef {
  id: string;
  label: string;
  hint: string;
  requirement?: string;
  category?: InterviewQuestionCategory;
  time_seconds?: number;
}

export interface JobScreeningQuestions {
  prescreen: ScreeningQuestionDef[];
  interview: ScreeningQuestionDef[];
  generated_at?: string;
  source?: 'ai' | 'template' | 'default';
  /** Target budget for screening (prescreen) questions. */
  screening_duration_seconds?: number;
  /** Target budget for scheduled (interview) questions. */
  scheduled_duration_seconds?: number;
  /** Sum of prescreen time_seconds after packing. */
  screening_total_seconds?: number;
  /** Sum of interview time_seconds after packing. */
  scheduled_total_seconds?: number;
  /** Sector the pack was written for. */
  industry?: string;
  /** Experience band the pack was pitched at. */
  experience_band?: ExperienceBand;
}

export const DEFAULT_PRESCREEN_QUESTIONS: ScreeningQuestionDef[] = [
  {
    id: 'commitment_language',
    label: 'Commitment Language',
    hint: 'Says "I will", "Yes I can", "I\'m available" — not "maybe", "try", "let\'s see".',
    time_seconds: 60,
  },
  {
    id: 'future_clarity',
    label: 'Future Clarity',
    hint: 'Clear about career direction, notice period and joining timeline.',
    time_seconds: 60,
  },
  {
    id: 'opportunity_competition',
    label: 'Opportunity Competition',
    hint: 'Low competing-offer risk — not juggling multiple interviews/offers.',
    time_seconds: 60,
  },
  {
    id: 'motivation_strength',
    label: 'Motivation Strength',
    hint: 'Gives specific, genuine reasons for wanting this role.',
    time_seconds: 60,
  },
  {
    id: 'stability_indicators',
    label: 'Stability Indicators',
    hint: 'Work history and current situation suggest they will stay.',
    time_seconds: 60,
  },
];

/** Default scheduled set sized for ~15 minutes (900s). */
export const DEFAULT_INTERVIEW_QUESTIONS: ScreeningQuestionDef[] = [
  {
    id: 'self_intro',
    label: 'Introduce Yourself',
    category: 'introduction',
    time_seconds: 90,
    hint: 'Name, background, education, relevant experience, and strengths for this role.',
  },
  {
    id: 'role_motivation',
    label: 'Why are you interested in this role?',
    category: 'introduction',
    time_seconds: 60,
    hint: 'Specific reasons tied to the job title and responsibilities — not generic answers.',
  },
  {
    id: 'relevant_experience',
    label: 'Walk me through your most relevant experience',
    category: 'technical',
    time_seconds: 120,
    hint: 'Projects, tools, and outcomes that map to the JD requirements.',
  },
  {
    id: 'core_skill_depth',
    label: 'Deep dive on a core skill from the JD',
    category: 'technical',
    time_seconds: 120,
    hint: 'Ask about a primary requirement — how they used it, challenges faced, results delivered.',
  },
  {
    id: 'project_deep_dive',
    label: 'Tell me about a project you owned end-to-end',
    category: 'technical',
    time_seconds: 120,
    hint: 'Scope, tech stack, your role, trade-offs, and measurable outcome.',
  },
  {
    id: 'problem_solving',
    label: 'Describe a challenging problem you solved',
    category: 'behavioral',
    time_seconds: 90,
    hint: 'STAR format: situation, action, result. Look for ownership and clarity.',
  },
  {
    id: 'teamwork_communication',
    label: 'How do you work with a team and communicate progress?',
    category: 'behavioral',
    time_seconds: 60,
    hint: 'Collaboration style, handling disagreements, keeping stakeholders informed.',
  },
  {
    id: 'why_hire_you',
    label: 'Why should we hire you for this role?',
    category: 'goals',
    time_seconds: 60,
    hint: 'Strengths and experience that directly match the JD requirements.',
  },
  {
    id: 'notice_and_joining',
    label: 'Notice period and joining timeline',
    category: 'goals',
    time_seconds: 60,
    hint: 'Clear, committed answer on availability and any constraints.',
  },
  {
    id: 'salary_expectation',
    label: 'Salary expectation',
    category: 'goals',
    time_seconds: 60,
    hint: 'Reasonable range aligned with role level and market standards.',
  },
];

export const INTERVIEW_CATEGORY_LABELS: Record<InterviewQuestionCategory, string> = {
  introduction: 'Introduction & Fit',
  technical: 'Role & Technical',
  domain: 'Domain Knowledge',
  behavioral: 'Behavioral & Communication',
  goals: 'Goals & Commitment',
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 48) || 'question';
}

function uniqueId(base: string, used: Set<string>): string {
  let id = slugify(base);
  let n = 2;
  while (used.has(id)) {
    id = `${slugify(base)}_${n++}`;
  }
  used.add(id);
  return id;
}

export function sumQuestionSeconds(questions: ScreeningQuestionDef[]): number {
  return questions.reduce((sum, q) => sum + (q.time_seconds || 0), 0);
}

/**
 * Keep questions in order until the budget is filled.
 * Always keeps at least the first question (trimmed if needed).
 */
export function packQuestionsToBudget(
  questions: ScreeningQuestionDef[],
  budgetSeconds: number,
  defaultTimeSeconds: number
): ScreeningQuestionDef[] {
  if (!questions.length) return [];

  const packed: ScreeningQuestionDef[] = [];
  let used = 0;

  for (const q of questions) {
    const time = Math.max(30, Math.min(q.time_seconds || defaultTimeSeconds, budgetSeconds));
    if (packed.length > 0 && used + time > budgetSeconds) break;
    const clamped = packed.length === 0 ? Math.min(time, budgetSeconds) : time;
    packed.push({ ...q, time_seconds: clamped });
    used += clamped;
  }

  return packed;
}

function withDurationMeta(questions: JobScreeningQuestions): JobScreeningQuestions {
  const screeningBudget = questions.screening_duration_seconds ?? SCREENING_DURATION_SECONDS;
  const scheduledBudget = questions.scheduled_duration_seconds ?? SCHEDULED_DURATION_SECONDS;
  const prescreen = packQuestionsToBudget(questions.prescreen, screeningBudget, 60);
  const interview = packQuestionsToBudget(questions.interview, scheduledBudget, 90);

  return {
    ...questions,
    prescreen,
    interview,
    screening_duration_seconds: screeningBudget,
    scheduled_duration_seconds: scheduledBudget,
    screening_total_seconds: sumQuestionSeconds(prescreen),
    scheduled_total_seconds: sumQuestionSeconds(interview),
  };
}

/** Pull bullet lines from the Requirements section of a plain-text JD. */
export function parseRequirementsFromDescription(description: string): string[] {
  if (!description?.trim()) return [];

  const reqMatch = description.match(/requirements?:?\s*\n([\s\S]*?)(?:\n\s*\n|\nwhat we offer|$)/i);
  const section = reqMatch ? reqMatch[1] : description;

  const bullets = section
    .split('\n')
    .map((line) => line.replace(/^[\s\-•*]+/, '').trim())
    .filter((line) => line.length > 10 && !/^what we offer/i.test(line));

  return bullets.slice(0, 8);
}

/** Representative years of experience for the posting, used to pitch depth. */
export function bandForJob(
  minExperience?: number | null,
  maxExperience?: number | null
): ExperienceBand {
  const min = minExperience != null ? Number(minExperience) : null;
  const max = maxExperience != null ? Number(maxExperience) : null;
  if (min != null && max != null) return experienceBand((min + max) / 2);
  if (min != null) return experienceBand(min);
  if (max != null) return experienceBand(max);
  return experienceBand(null);
}

/** How deeply to probe the primary skill, by experience band. */
const DEPTH_HINT: Record<ExperienceBand, string> = {
  fresher: 'Fresher: look for fundamentals, training projects, and willingness to learn — not production experience.',
  junior: 'Junior: look for hands-on tasks they owned end-to-end under supervision.',
  mid: 'Mid-level: look for independent ownership, trade-offs made, and measurable outcomes.',
  senior: 'Senior: look for scale, design decisions, mentoring, and business impact.',
};

/**
 * Deterministic fallback pack, built from the JD requirements, the role title,
 * the required experience band, and the sector. Used when AI is not live, and
 * as the shape the AI output is normalized into.
 */
function buildTemplateQuestions(input: ScreeningQuestionsInput): JobScreeningQuestions {
  const title = input.title;
  const requirements = parseRequirementsFromDescription(input.description || '');
  const used = new Set<string>();
  const jobTypeHint = input.job_type ? ` (${input.job_type})` : '';
  const industry = normalizeIndustry(input.industry);
  const sector = industry ? ` in ${industry}` : '';
  const profile = industryProfile(input.industry);
  const band = bandForJob(input.min_experience, input.max_experience);
  const bandLabel = EXPERIENCE_BAND_LABELS[band];

  const prescreen: ScreeningQuestionDef[] = [
    {
      id: 'role_motivation',
      label: `Why do you want this ${title} role${sector}${jobTypeHint}?`,
      hint: `Look for specific reasons tied to the role — not "any job will do". ${profile.screeningFocus[0] ? `Listen for: ${profile.screeningFocus[0]}.` : ''}`.trim(),
      requirement: title,
      time_seconds: 60,
    },
    {
      id: 'relevant_experience_fit',
      label: `How does your experience match this ${bandLabel} opening?`,
      hint: requirements.length
        ? `Probe against: ${requirements.slice(0, 3).join('; ')}. ${DEPTH_HINT[band]}`
        : DEPTH_HINT[band],
      requirement: requirements[0],
      time_seconds: 60,
    },
    {
      id: 'skill_confidence',
      label: requirements[0]
        ? `Rate your confidence in: ${requirements[0]}`
        : `Rate confidence in the primary skill for this ${title} role`,
      hint: '1 = no experience, 5 = can teach others. Follow up with a concrete example.',
      requirement: requirements[0],
      time_seconds: 60,
    },
    {
      id: 'joining_commitment',
      label: 'Notice period and joining commitment',
      hint: 'Clear timeline with committed language — red flag if vague ("maybe", "depends").',
      time_seconds: 60,
    },
    {
      id: 'sector_logistics',
      label: industry ? `${industry} working conditions` : 'Working conditions and availability',
      hint: `${profile.logisticsPrompt} Common drop-out reasons here: ${profile.attritionDrivers.join(', ')}.`,
      time_seconds: 60,
    },
  ].map((q) => ({ ...q, id: uniqueId(q.id, used) }));

  const interview: ScreeningQuestionDef[] = [];

  interview.push({
    id: uniqueId('self_intro', used),
    label: 'Introduce Yourself',
    category: 'introduction',
    time_seconds: 90,
    hint: 'Name, background, education, and experience relevant to this role.',
  });

  interview.push({
    id: uniqueId('why_this_role', used),
    label: `Why are you interested in the ${title} position${jobTypeHint}?`,
    category: 'introduction',
    time_seconds: 60,
    hint: 'Specific motivation aligned with the JD — not generic career goals.',
    requirement: title,
  });

  for (const req of requirements.slice(0, 3)) {
    interview.push({
      id: uniqueId(req, used),
      label: `Experience with: ${req}`,
      category: 'technical',
      time_seconds: 120,
      hint: `Ask for a real example — tools used, their role, challenges, and measurable outcome. ${DEPTH_HINT[band]}`,
      requirement: req,
    });
  }

  if (requirements.length < 2) {
    interview.push({
      id: uniqueId('core_skill_depth', used),
      label: `Deep dive on the core skill for a ${title}`,
      category: 'technical',
      time_seconds: 120,
      hint: `How they applied it, what they learned, and results they delivered. ${DEPTH_HINT[band]}`,
    });
  }

  interview.push({
    id: uniqueId('domain_knowledge', used),
    label: industry
      ? `${industry} domain knowledge for a ${title}`
      : `Domain knowledge for a ${title}`,
    category: 'domain',
    time_seconds: 90,
    hint: `Probe the sector essentials: ${profile.screeningFocus.join(', ')}.`,
    requirement: industry || undefined,
  });

  interview.push(
    {
      id: uniqueId('problem_solving', used),
      label: 'Describe a challenging problem you solved',
      category: 'behavioral',
      time_seconds: 90,
      hint: 'STAR format — look for ownership, clarity, and outcome.',
    },
    {
      id: uniqueId('teamwork', used),
      label: 'How do you collaborate and communicate with a team?',
      category: 'behavioral',
      time_seconds: 60,
      hint: 'Handling disagreements, sharing progress, and working cross-functionally.',
    },
    {
      id: uniqueId('why_hire_you', used),
      label: 'Why should we hire you for this role?',
      category: 'goals',
      time_seconds: 60,
      hint: 'Strengths that directly map to the JD requirements listed above.',
    },
    {
      id: uniqueId('salary_expectation', used),
      label: 'Salary expectation',
      category: 'goals',
      time_seconds: 60,
      hint: 'Reasonable range for the role level and location.',
    }
  );

  return withDurationMeta({
    prescreen,
    interview,
    generated_at: new Date().toISOString(),
    source: 'template',
    industry: industry || undefined,
    experience_band: band,
    screening_duration_seconds: input.screening_duration_seconds ?? SCREENING_DURATION_SECONDS,
    scheduled_duration_seconds: input.scheduled_duration_seconds ?? SCHEDULED_DURATION_SECONDS,
  });
}

function normalizeQuestions(raw: JobScreeningQuestions): JobScreeningQuestions {
  const used = new Set<string>();
  const normalize = (
    items: ScreeningQuestionDef[],
    fallback: ScreeningQuestionDef[],
    defaultTime: number
  ) => {
    const list = items?.length ? items : fallback;
    return list.map((q, i) => ({
      ...q,
      id: q.id && !used.has(q.id) ? (used.add(q.id), q.id) : uniqueId(q.label || `q_${i}`, used),
      label: q.label?.trim() || `Question ${i + 1}`,
      hint: q.hint?.trim() || 'Score the answer 1 (weak) to 5 (strong).',
      time_seconds: q.time_seconds && q.time_seconds > 0 ? q.time_seconds : defaultTime,
    }));
  };

  return withDurationMeta({
    ...raw,
    prescreen: normalize(raw.prescreen, DEFAULT_PRESCREEN_QUESTIONS, 60),
    interview: normalize(raw.interview, DEFAULT_INTERVIEW_QUESTIONS, 90),
    generated_at: raw.generated_at || new Date().toISOString(),
    source: raw.source || 'default',
    screening_duration_seconds: raw.screening_duration_seconds ?? SCREENING_DURATION_SECONDS,
    scheduled_duration_seconds: raw.scheduled_duration_seconds ?? SCHEDULED_DURATION_SECONDS,
  });
}

export async function generateJobScreeningQuestions(
  input: ScreeningQuestionsInput
): Promise<JobScreeningQuestions> {
  const screeningBudget = input.screening_duration_seconds ?? SCREENING_DURATION_SECONDS;
  const scheduledBudget = input.scheduled_duration_seconds ?? SCHEDULED_DURATION_SECONDS;

  if (input.description?.trim()) {
    if (aiMode() === 'live') {
      const aiResult = await generateScreeningQuestionsFromJd({
        ...input,
        screening_duration_seconds: screeningBudget,
        scheduled_duration_seconds: scheduledBudget,
      });
      if (aiResult) {
        return normalizeQuestions({
          prescreen: aiResult.prescreen.map((q) => ({
            ...q,
            category: q.category as InterviewQuestionCategory | undefined,
          })),
          interview: aiResult.interview.map((q) => ({
            ...q,
            category: q.category as InterviewQuestionCategory | undefined,
          })),
          source: 'ai',
          industry: normalizeIndustry(input.industry) || undefined,
          experience_band: bandForJob(input.min_experience, input.max_experience),
          screening_duration_seconds: screeningBudget,
          scheduled_duration_seconds: scheduledBudget,
        });
      }
    }
    return normalizeQuestions(buildTemplateQuestions(input));
  }

  return normalizeQuestions({
    prescreen: DEFAULT_PRESCREEN_QUESTIONS,
    interview: DEFAULT_INTERVIEW_QUESTIONS,
    generated_at: new Date().toISOString(),
    source: 'default',
    industry: normalizeIndustry(input.industry) || undefined,
    experience_band: bandForJob(input.min_experience, input.max_experience),
    screening_duration_seconds: screeningBudget,
    scheduled_duration_seconds: scheduledBudget,
  });
}

export async function saveJobScreeningQuestions(
  jobId: number,
  tenantId: number,
  questions: JobScreeningQuestions
): Promise<void> {
  await pool.query(
    'UPDATE jobs SET screening_questions = $1::jsonb WHERE id = $2 AND tenant_id = $3',
    [JSON.stringify(questions), jobId, tenantId]
  );
}

export async function ensureJobScreeningQuestions(
  jobId: number,
  tenantId: number,
  force = false
): Promise<JobScreeningQuestions> {
  const { rows } = await pool.query(
    'SELECT title, description, client, location, job_type, industry, min_experience, max_experience, screening_questions FROM jobs WHERE id = $1 AND tenant_id = $2',
    [jobId, tenantId]
  );
  const job = rows[0];
  if (!job) throw new Error('Job not found');

  if (!force && job.screening_questions?.prescreen?.length && job.screening_questions?.interview?.length) {
    return normalizeQuestions(job.screening_questions as JobScreeningQuestions);
  }

  const questions = await generateJobScreeningQuestions({
    title: job.title,
    description: job.description,
    client: job.client,
    location: job.location,
    job_type: job.job_type,
    industry: job.industry,
    min_experience: job.min_experience,
    max_experience: job.max_experience,
  });

  await saveJobScreeningQuestions(jobId, tenantId, questions);
  return questions;
}

/**
 * Questions a recruiter asks this candidate = the pack stored on the job they
 * are applied to. Nothing is generated per candidate, so every candidate on a
 * job is scored against the same standard set.
 */
export async function getScreeningQuestionsForCandidate(
  candidateId: number,
  tenantId: number
): Promise<{ job_id: number | null; job_title: string | null; questions: JobScreeningQuestions }> {
  const { rows } = await pool.query(
    `SELECT c.job_id, j.title AS job_title
     FROM candidates c
     LEFT JOIN jobs j ON j.id = c.job_id AND j.tenant_id = c.tenant_id
     WHERE c.id = $1 AND c.tenant_id = $2`,
    [candidateId, tenantId]
  );
  const row = rows[0];
  if (!row) throw new Error('Candidate not found');

  if (!row.job_id) {
    return {
      job_id: null,
      job_title: null,
      questions: normalizeQuestions({
        prescreen: DEFAULT_PRESCREEN_QUESTIONS,
        interview: DEFAULT_INTERVIEW_QUESTIONS,
        source: 'default',
      }),
    };
  }

  const questions = await ensureJobScreeningQuestions(row.job_id, tenantId);
  return { job_id: row.job_id, job_title: row.job_title, questions };
}

export async function getScreeningQuestionsForInterview(
  interviewId: number,
  tenantId: number
): Promise<{ job_id: number | null; job_title: string | null; questions: JobScreeningQuestions }> {
  const { rows } = await pool.query(
    `SELECT c.job_id, j.title AS job_title
     FROM interviews i
     JOIN candidates c ON c.id = i.candidate_id
     LEFT JOIN jobs j ON j.id = c.job_id AND j.tenant_id = c.tenant_id
     WHERE i.id = $1 AND c.tenant_id = $2`,
    [interviewId, tenantId]
  );
  const row = rows[0];
  if (!row) throw new Error('Interview not found');

  if (!row.job_id) {
    return {
      job_id: null,
      job_title: null,
      questions: normalizeQuestions({
        prescreen: DEFAULT_PRESCREEN_QUESTIONS,
        interview: DEFAULT_INTERVIEW_QUESTIONS,
        source: 'default',
      }),
    };
  }

  const questions = await ensureJobScreeningQuestions(row.job_id, tenantId);
  return { job_id: row.job_id, job_title: row.job_title, questions };
}
