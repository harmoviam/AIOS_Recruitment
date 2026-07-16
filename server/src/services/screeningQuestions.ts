import { pool } from '../dbConfig.js';
import { aiMode, generateScreeningQuestionsFromJd } from './ai.js';

export type InterviewQuestionCategory =
  | 'introduction'
  | 'technical'
  | 'domain'
  | 'behavioral'
  | 'goals';

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
}

export const DEFAULT_PRESCREEN_QUESTIONS: ScreeningQuestionDef[] = [
  {
    id: 'commitment_language',
    label: 'Commitment Language',
    hint: 'Says "I will", "Yes I can", "I\'m available" — not "maybe", "try", "let\'s see".',
  },
  {
    id: 'future_clarity',
    label: 'Future Clarity',
    hint: 'Clear about career direction, notice period and joining timeline.',
  },
  {
    id: 'opportunity_competition',
    label: 'Opportunity Competition',
    hint: 'Low competing-offer risk — not juggling multiple interviews/offers.',
  },
  {
    id: 'motivation_strength',
    label: 'Motivation Strength',
    hint: 'Gives specific, genuine reasons for wanting this role.',
  },
  {
    id: 'stability_indicators',
    label: 'Stability Indicators',
    hint: 'Work history and current situation suggest they will stay.',
  },
];

export const DEFAULT_INTERVIEW_QUESTIONS: ScreeningQuestionDef[] = [
  {
    id: 'self_intro',
    label: 'Introduce Yourself',
    category: 'introduction',
    time_seconds: 120,
    hint: 'Name, background, education, relevant experience, and strengths for this role.',
  },
  {
    id: 'role_motivation',
    label: 'Why are you interested in this role?',
    category: 'introduction',
    time_seconds: 90,
    hint: 'Specific reasons tied to the job title and responsibilities — not generic answers.',
  },
  {
    id: 'relevant_experience',
    label: 'Walk me through your most relevant experience',
    category: 'technical',
    time_seconds: 180,
    hint: 'Projects, tools, and outcomes that map to the JD requirements.',
  },
  {
    id: 'core_skill_depth',
    label: 'Deep dive on a core skill from the JD',
    category: 'technical',
    time_seconds: 180,
    hint: 'Ask about a primary requirement — how they used it, challenges faced, results delivered.',
  },
  {
    id: 'problem_solving',
    label: 'Describe a challenging problem you solved',
    category: 'behavioral',
    time_seconds: 120,
    hint: 'STAR format: situation, action, result. Look for ownership and clarity.',
  },
  {
    id: 'teamwork_communication',
    label: 'How do you work with a team and communicate progress?',
    category: 'behavioral',
    time_seconds: 90,
    hint: 'Collaboration style, handling disagreements, keeping stakeholders informed.',
  },
  {
    id: 'handle_pressure',
    label: 'How do you handle deadlines and pressure?',
    category: 'behavioral',
    time_seconds: 90,
    hint: 'Prioritization, escalation, and staying calm under tight timelines.',
  },
  {
    id: 'why_organization',
    label: 'Why this organization? Why work with us?',
    category: 'goals',
    time_seconds: 90,
    hint: 'Research about the company/client and genuine interest beyond salary.',
  },
  {
    id: 'why_hire_you',
    label: 'Why should we hire you for this role?',
    category: 'goals',
    time_seconds: 90,
    hint: 'Strengths and experience that directly match the JD requirements.',
  },
  {
    id: 'short_term_goal',
    label: 'What is your short-term goal in this role?',
    category: 'goals',
    time_seconds: 90,
    hint: 'Onboarding, learning curve, and early contributions they plan to make.',
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

function buildTemplateQuestions(title: string, description: string): JobScreeningQuestions {
  const requirements = parseRequirementsFromDescription(description);
  const used = new Set<string>();

  const prescreen: ScreeningQuestionDef[] = [
    {
      id: 'role_motivation',
      label: `Why do you want this ${title} role?`,
      hint: `Look for specific reasons tied to the role — not "any job will do".`,
      requirement: title,
    },
    {
      id: 'relevant_experience_fit',
      label: 'How does your experience match the key requirements?',
      hint: requirements.length
        ? `Probe against: ${requirements.slice(0, 3).join('; ')}`
        : 'Ask them to connect their background to the role requirements.',
      requirement: requirements[0],
    },
    {
      id: 'skill_confidence',
      label: requirements[0]
        ? `Rate your confidence in: ${requirements[0]}`
        : 'Rate confidence in the primary skill for this role',
      hint: '1 = no experience, 5 = can teach others. Follow up with a concrete example.',
      requirement: requirements[0],
    },
    {
      id: 'joining_commitment',
      label: 'Notice period and joining commitment',
      hint: 'Clear timeline with committed language — red flag if vague ("maybe", "depends").',
    },
    {
      id: 'stability_indicators',
      label: 'Stability Indicators',
      hint: 'Work history and current situation suggest they will stay in this role.',
    },
  ].map((q) => ({ ...q, id: uniqueId(q.id, used) }));

  const interview: ScreeningQuestionDef[] = [];
  const introIds = new Set<string>();

  interview.push({
    id: uniqueId('self_intro', used),
    label: 'Introduce Yourself',
    category: 'introduction',
    time_seconds: 120,
    hint: 'Name, background, education, and experience relevant to this role.',
  });
  introIds.add(interview[interview.length - 1].id);

  interview.push({
    id: uniqueId('why_this_role', used),
    label: `Why are you interested in the ${title} position?`,
    category: 'introduction',
    time_seconds: 90,
    hint: 'Specific motivation aligned with the JD — not generic career goals.',
    requirement: title,
  });

  for (const req of requirements.slice(0, 5)) {
    interview.push({
      id: uniqueId(req, used),
      label: `Experience with: ${req}`,
      category: 'technical',
      time_seconds: 180,
      hint: `Ask for a real example — tools used, their role, challenges, and measurable outcome.`,
      requirement: req,
    });
  }

  if (requirements.length < 3) {
    interview.push({
      id: uniqueId('core_skill_depth', used),
      label: 'Deep dive on your strongest relevant skill',
      category: 'technical',
      time_seconds: 180,
      hint: 'How they applied it, what they learned, and results they delivered.',
    });
  }

  interview.push(
    {
      id: uniqueId('problem_solving', used),
      label: 'Describe a challenging problem you solved',
      category: 'behavioral',
      time_seconds: 120,
      hint: 'STAR format — look for ownership, clarity, and outcome.',
    },
    {
      id: uniqueId('teamwork', used),
      label: 'How do you collaborate and communicate with a team?',
      category: 'behavioral',
      time_seconds: 90,
      hint: 'Handling disagreements, sharing progress, and working cross-functionally.',
    },
    {
      id: uniqueId('why_hire_you', used),
      label: 'Why should we hire you for this role?',
      category: 'goals',
      time_seconds: 90,
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

  return {
    prescreen,
    interview,
    generated_at: new Date().toISOString(),
    source: 'template',
  };
}

function normalizeQuestions(raw: JobScreeningQuestions): JobScreeningQuestions {
  const used = new Set<string>();
  const normalize = (items: ScreeningQuestionDef[], fallback: ScreeningQuestionDef[]) => {
    const list = items?.length ? items : fallback;
    return list.map((q, i) => ({
      ...q,
      id: q.id && !used.has(q.id) ? (used.add(q.id), q.id) : uniqueId(q.label || `q_${i}`, used),
      label: q.label?.trim() || `Question ${i + 1}`,
      hint: q.hint?.trim() || 'Score the answer 1 (weak) to 5 (strong).',
    }));
  };

  return {
    prescreen: normalize(raw.prescreen, DEFAULT_PRESCREEN_QUESTIONS),
    interview: normalize(raw.interview, DEFAULT_INTERVIEW_QUESTIONS),
    generated_at: raw.generated_at || new Date().toISOString(),
    source: raw.source || 'default',
  };
}

export async function generateJobScreeningQuestions(input: {
  title: string;
  description?: string | null;
  client?: string | null;
  location?: string | null;
}): Promise<JobScreeningQuestions> {
  if (input.description?.trim()) {
    if (aiMode() === 'live') {
      const aiResult = await generateScreeningQuestionsFromJd(input);
      if (aiResult) {
        return normalizeQuestions({
          prescreen: aiResult.prescreen.map((q) => ({ ...q, category: q.category as InterviewQuestionCategory | undefined })),
          interview: aiResult.interview.map((q) => ({ ...q, category: q.category as InterviewQuestionCategory | undefined })),
          source: 'ai',
        });
      }
    }
    return normalizeQuestions(buildTemplateQuestions(input.title, input.description));
  }

  return normalizeQuestions({
    prescreen: DEFAULT_PRESCREEN_QUESTIONS,
    interview: DEFAULT_INTERVIEW_QUESTIONS,
    generated_at: new Date().toISOString(),
    source: 'default',
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
    'SELECT title, description, client, location, screening_questions FROM jobs WHERE id = $1 AND tenant_id = $2',
    [jobId, tenantId]
  );
  const job = rows[0];
  if (!job) throw new Error('Job not found');

  if (!force && job.screening_questions?.prescreen?.length && job.screening_questions?.interview?.length) {
    return job.screening_questions as JobScreeningQuestions;
  }

  const questions = await generateJobScreeningQuestions({
    title: job.title,
    description: job.description,
    client: job.client,
    location: job.location,
  });

  await saveJobScreeningQuestions(jobId, tenantId, questions);
  return questions;
}

export async function getScreeningQuestionsForCandidate(
  candidateId: number,
  tenantId: number
): Promise<{ job_id: number | null; job_title: string | null; questions: JobScreeningQuestions }> {
  const { rows } = await pool.query(
    `SELECT c.job_id, j.title AS job_title, j.screening_questions
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
