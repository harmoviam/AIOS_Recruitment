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
  /**
   * Terms a solid answer should contain. The recruiter ticks off what they
   * actually hear, so scoring is evidence-based rather than a gut call.
   */
  expected_keywords?: string[];
  /** What a 4-5 answer sounds like. */
  strong_answer?: string;
  /** What a 1-2 answer sounds like. */
  weak_answer?: string;
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

/**
 * A JD bullet that states a threshold to meet rather than a competency to probe
 * — "7+ years of relevant experience", "B.Tech in Computer Science".
 *
 * These must never be templated as skills: "Rate your confidence in: 7+ years of
 * relevant experience" and "Experience with: 7+ years of relevant experience"
 * are both nonsense, and they burn interview minutes on a yes/no fact that the
 * resume already answers.
 */
export function isQualificationRequirement(text: string): boolean {
  return /(\d+\s*\+?\s*(years?|yrs?)\b)|\b(bachelor|master|b\.?tech|b\.?e\b|b\.?sc|m\.?tech|m\.?sc|mba|mca|bca|graduate|post[- ]?graduate|degree|diploma)\b/i.test(
    text
  );
}

/**
 * Requirements worth building a competency question around: skills, tools, and
 * responsibilities — qualifications filtered out.
 */
export function skillRequirements(requirements: string[]): string[] {
  return requirements.filter((r) => !isQualificationRequirement(r));
}

// Lead-ins that describe how well someone knows a thing, not the thing itself.
const REQUIREMENT_LEAD_INS =
  /^(strong |solid |good |proven |demonstrable |hands[- ]on |working )?(proficiency|proficient|experience|expertise|understanding|knowledge|familiarity|exposure|command|ability|skills?)\s+(in|of|with|on|to)\s+/i;

const KEYWORD_STOPWORDS = new Set([
  'the', 'and', 'or', 'a', 'an', 'at', 'least', 'one', 'any', 'with', 'in', 'of', 'for', 'to',
  'on', 'as', 'is', 'are', 'be', 'other', 'etc', 'such', 'including', 'related', 'relevant',
  'good', 'strong', 'basic', 'plus', 'preferred', 'must', 'have', 'able',
]);

/**
 * Turn a JD requirement bullet into the handful of terms a recruiter should
 * actually listen for.
 *
 * "Understanding of databases, API design, and web fundamentals"
 *   → ['databases', 'API design', 'web fundamentals']
 */
export function requirementKeywords(text: string): string[] {
  if (!text?.trim()) return [];

  const body = text.trim().replace(REQUIREMENT_LEAD_INS, '');

  return body
    .split(/,|\band\b|\bor\b|\/|;|\|/i)
    .map((part) =>
      part
        .trim()
        // Drop leading quantifiers: "at least one backend technology" → "backend technology".
        .replace(/^(at least\s+)?(one|two|three|a|an|the)\s+/i, '')
        .replace(/[.;:]+$/, '')
        .trim()
    )
    .filter((part) => {
      if (part.length < 2 || part.length > 48) return false;
      const words = part.toLowerCase().split(/\s+/);
      return !words.every((w) => KEYWORD_STOPWORDS.has(w));
    })
    .slice(0, 6);
}

/** Merge keyword lists, case-insensitively de-duplicated, order preserved. */
export function mergeKeywords(...lists: Array<string[] | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const raw of list || []) {
      const value = raw?.trim();
      if (!value) continue;
      const key = value.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(value);
    }
  }
  return out.slice(0, 8);
}

/** "a" / "an" for a role label, so questions read naturally. */
export function indefiniteArticle(word: string): 'a' | 'an' {
  return /^[aeiou]/i.test(word.trim()) ? 'an' : 'a';
}

/** Trim a long posting title down to something readable inside a question. */
export function shortRoleLabel(title: string): string {
  // Drop parenthetical stack notes: "Team Lead – Full-Stack (MERN/MEAN)" → "Team Lead – Full-Stack".
  const withoutParens = title.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  const base = withoutParens || title.trim();
  return base.length > 42 ? `${base.slice(0, 42).trimEnd()}…` : base;
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
export function buildTemplateQuestions(input: ScreeningQuestionsInput): JobScreeningQuestions {
  const role = shortRoleLabel(input.title);
  const requirements = parseRequirementsFromDescription(input.description || '');
  // Only competencies get turned into questions; "7+ years" is a filter, not a topic.
  const skills = skillRequirements(requirements);
  const qualifications = requirements.filter(isQualificationRequirement);
  const used = new Set<string>();
  const industry = normalizeIndustry(input.industry);
  const sector = industry ? ` in ${industry}` : '';
  const profile = industryProfile(input.industry);
  const band = bandForJob(input.min_experience, input.max_experience);
  const bandLabel = EXPERIENCE_BAND_LABELS[band];
  const roleArticle = indefiniteArticle(role);

  // Skills named on the job record are the most reliable keyword source —
  // they are structured, unlike prose bullets scraped out of the JD.
  const jobSkills = (input.required_skills || []).filter((s) => s?.trim());
  const skillKeywords = mergeKeywords(jobSkills, ...skills.map(requirementKeywords));

  const prescreen: ScreeningQuestionDef[] = [
    {
      id: 'role_motivation',
      label: `Why do you want this ${role} role${sector}?`,
      hint: `Look for specific reasons tied to the role — not "any job will do". ${profile.screeningFocus[0] ? `Listen for: ${profile.screeningFocus[0]}.` : ''}`.trim(),
      time_seconds: 60,
      expected_keywords: mergeKeywords([role], skillKeywords.slice(0, 3), [
        'career goal',
        'growth',
      ]),
      strong_answer: `Names something specific about this ${role} role — the work, the stack, the team, or a career step it unlocks.`,
      weak_answer: '"Looking for a change", "need a job", or describes any role in the industry rather than this one.',
    },
    {
      id: 'relevant_experience_fit',
      // State the bar from the JD when there is one; otherwise fall back to the band.
      label: qualifications[0]
        ? `Walk me through the experience that meets: ${qualifications[0]}`
        : `How does your experience match this ${bandLabel} opening?`,
      hint: skills.length
        ? `Probe against: ${skills.slice(0, 3).join('; ')}. ${DEPTH_HINT[band]}`
        : DEPTH_HINT[band],
      requirement: qualifications[0],
      time_seconds: 60,
      expected_keywords: mergeKeywords(
        ['years', 'current role', 'employer'],
        skillKeywords.slice(0, 4)
      ),
      strong_answer:
        'Gives concrete tenure with named employers and maps that experience onto the requirements, with examples.',
      weak_answer: 'Restates the resume, inflates years, or cannot connect past work to this role.',
    },
    {
      id: 'skill_confidence',
      label: skills[0]
        ? `Rate your confidence in: ${skills[0]}`
        : `Rate your confidence in the core skill for ${roleArticle} ${role}`,
      hint: '1 = no experience, 5 = can teach others. Follow up with a concrete example.',
      requirement: skills[0],
      time_seconds: 60,
      expected_keywords: mergeKeywords(
        skills[0] ? requirementKeywords(skills[0]) : [],
        skillKeywords.slice(0, 3),
        ['example', 'project']
      ),
      strong_answer:
        'Gives a rating and immediately backs it with a specific example — where used, what they built, what went wrong.',
      weak_answer: 'Claims 4-5 but cannot produce an example, or the example is coursework rather than real work.',
    },
    {
      id: 'joining_commitment',
      label: 'Notice period and joining commitment',
      hint: 'Clear timeline with committed language — red flag if vague ("maybe", "depends").',
      time_seconds: 60,
      expected_keywords: [
        'notice period',
        'last working day',
        'immediate',
        'buyout',
        'resigned',
        'joining date',
      ],
      strong_answer: 'States a firm date or day count, plus whether resignation is already submitted.',
      weak_answer: '"Maybe next month", "depends", or the timeline shifts when pressed.',
    },
    {
      id: 'sector_logistics',
      label: industry ? `${industry} working conditions` : 'Working conditions and availability',
      hint: `${profile.logisticsPrompt} Common drop-out reasons here: ${profile.attritionDrivers.join(', ')}.`,
      time_seconds: 60,
      expected_keywords: mergeKeywords(
        ['shift', 'commute', 'location', 'travel'],
        profile.attritionDrivers
      ),
      strong_answer: `Accepts the stated conditions without hedging and has already thought about ${profile.attritionDrivers[0]}.`,
      weak_answer: `Hesitates on ${profile.attritionDrivers.slice(0, 2).join(' or ')}, or says they will "check with family" and get back.`,
    },
  ].map((q) => ({ ...q, id: uniqueId(q.id, used) }));

  const interview: ScreeningQuestionDef[] = [];

  interview.push({
    id: uniqueId('self_intro', used),
    label: 'Introduce Yourself',
    category: 'introduction',
    time_seconds: 90,
    hint: 'Name, background, education, and experience relevant to this role.',
    expected_keywords: mergeKeywords(
      ['years of experience', 'current role', 'employer', 'education'],
      skillKeywords.slice(0, 3)
    ),
    strong_answer:
      'Structured 60-90s: who they are, current role and employer, relevant projects, and why they fit this opening.',
    weak_answer: 'Reads the resume aloud, rambles past 2 minutes, or covers only personal details.',
  });

  // Motivation is already covered in screening — go one level deeper here
  // instead of repeating "why this role?" almost word for word.
  interview.push({
    id: uniqueId('role_understanding', used),
    label: `What do you expect the day-to-day of this ${role} role to involve?`,
    category: 'introduction',
    time_seconds: 60,
    hint: 'Tests whether they read the JD and understand the actual work — not just the title.',
    expected_keywords: mergeKeywords(skillKeywords.slice(0, 4), profile.domainKeywords.slice(0, 3)),
    strong_answer: 'Describes concrete daily activities that match the JD, and asks a clarifying question about scope.',
    weak_answer: 'Generic "I will do my best and learn", or describes a different role entirely.',
  });

  for (const skill of skills.slice(0, 3)) {
    interview.push({
      id: uniqueId(skill, used),
      label: `Experience with: ${skill}`,
      category: 'technical',
      time_seconds: 120,
      hint: `Ask for a real example — tools used, their role, challenges, and measurable outcome. ${DEPTH_HINT[band]}`,
      requirement: skill,
      expected_keywords: mergeKeywords(requirementKeywords(skill), jobSkills, [
        'example',
        'outcome',
      ]),
      strong_answer: `Names a real project using ${requirementKeywords(skill)[0] || skill}, their specific role in it, a problem hit, and the result.`,
      weak_answer: 'Describes it in theory, uses "we" throughout without their own contribution, or has only tutorial exposure.',
    });
  }

  if (skills.length < 2) {
    interview.push({
      id: uniqueId('core_skill_depth', used),
      label: `Deep dive on the core skill for ${roleArticle} ${role}`,
      category: 'technical',
      time_seconds: 120,
      hint: `How they applied it, what they learned, and results they delivered. ${DEPTH_HINT[band]}`,
      expected_keywords: mergeKeywords(jobSkills, profile.domainKeywords.slice(0, 4), ['example', 'outcome']),
      strong_answer: 'Concrete example with their own ownership, a real obstacle, and a measurable result.',
      weak_answer: 'Textbook definition with no application, or cannot go past the first follow-up.',
    });
  }

  interview.push({
    id: uniqueId('domain_knowledge', used),
    label: industry
      ? `${industry} domain knowledge for ${roleArticle} ${role}`
      : `Domain knowledge for ${roleArticle} ${role}`,
    category: 'domain',
    time_seconds: 90,
    hint: `Probe the sector essentials: ${profile.screeningFocus.join(', ')}.`,
    requirement: industry || undefined,
    // Sector vocabulary a competent candidate reaches for unprompted.
    expected_keywords: profile.domainKeywords,
    strong_answer: `Uses sector vocabulary unprompted (${profile.domainKeywords.slice(0, 3).join(', ')}) and ties it to their own work.`,
    weak_answer: 'Answers in generic terms, or uses the vocabulary only after you supply it.',
  });

  interview.push(
    {
      id: uniqueId('problem_solving', used),
      label: 'Describe a challenging problem you solved',
      category: 'behavioral',
      time_seconds: 90,
      hint: 'STAR format — look for ownership, clarity, and outcome.',
      expected_keywords: ['situation', 'my role', 'action', 'trade-off', 'result', 'impact', 'metric'],
      strong_answer: 'Clear situation → their action → measurable result, with a trade-off they consciously made.',
      weak_answer: 'Stays at "we had issues and fixed them", or the problem is trivial for their claimed level.',
    },
    {
      id: uniqueId('teamwork', used),
      label: 'How do you collaborate and communicate with a team?',
      category: 'behavioral',
      time_seconds: 60,
      hint: 'Handling disagreements, sharing progress, and working cross-functionally.',
      expected_keywords: ['stand-up', 'stakeholder', 'disagreement', 'escalation', 'handover', 'feedback', 'documentation'],
      strong_answer: 'Names actual rituals and a real disagreement they resolved without escalating badly.',
      weak_answer: '"I get along with everyone" with no specifics, or blames past teams.',
    },
    {
      id: uniqueId('why_hire_you', used),
      label: 'Why should we hire you for this role?',
      category: 'goals',
      time_seconds: 60,
      hint: 'Strengths that directly map to the JD requirements listed above.',
      expected_keywords: mergeKeywords(skillKeywords.slice(0, 4), ['track record', 'outcome']),
      strong_answer: 'Picks two or three JD requirements and evidences each with something they have already done.',
      weak_answer: 'Lists personality traits ("hard-working", "quick learner") with nothing tied to the JD.',
    },
    {
      id: uniqueId('salary_expectation', used),
      label: 'Salary expectation',
      category: 'goals',
      time_seconds: 60,
      hint: 'Reasonable range for the role level and location.',
      expected_keywords: ['current CTC', 'expected CTC', 'fixed', 'variable', 'notice period', 'negotiable'],
      strong_answer: 'Gives current and expected figures with a fixed/variable split, and a range that fits the posted band.',
      weak_answer: 'Refuses to name a number, or quotes well above the band without justification.',
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
      // Model output can arrive as a comma-joined string, or with blanks/dupes.
      expected_keywords: mergeKeywords(
        Array.isArray(q.expected_keywords)
          ? q.expected_keywords
          : typeof q.expected_keywords === 'string'
            ? String(q.expected_keywords).split(',')
            : []
      ),
      strong_answer: q.strong_answer?.trim() || undefined,
      weak_answer: q.weak_answer?.trim() || undefined,
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
    `SELECT title, description, client, location, job_type, industry, min_experience, max_experience,
            required_skills, screening_questions
     FROM jobs WHERE id = $1 AND tenant_id = $2`,
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
    required_skills: Array.isArray(job.required_skills) ? job.required_skills : [],
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
