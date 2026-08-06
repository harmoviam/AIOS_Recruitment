import OpenAI from 'openai';
import { pool } from '../dbConfig.js';
import { PDL_SENIORITY_LEVELS, type PeopleSearchFilters } from '../types/sourcing.js';

/**
 * AI service — any OpenAI-compatible chat-completions endpoint.
 *
 * Designed for self-hosted open-weight models (vLLM, Ollama, llama.cpp
 * server) but also works against hosted providers (OpenAI, GitHub Models).
 *
 * Works in two modes, decided by environment variables (see .env.example),
 * mirroring the WhatsApp integration:
 *
 *  - disabled (default): AI_BASE_URL/AI_API_KEY or AI_MODEL missing → every
 *    helper returns null and callers fall back to the existing
 *    heuristics/templates. Safe for dev.
 *  - live: AI_MODEL plus AI_BASE_URL (self-hosted) or AI_API_KEY (hosted)
 *    set, and AI_ENABLED not "false" → suggestions, candidate screening
 *    scores, follow-up scripts and job descriptions are model-generated.
 *
 * Examples:
 *   Ollama (local): AI_BASE_URL=http://localhost:11434/v1  AI_MODEL=qwen3:8b
 *   vLLM (cloud):   AI_BASE_URL=http://<host>:8000/v1      AI_MODEL=Qwen/Qwen3.6-27B
 *
 * Every helper is fail-soft: an API error is logged and null is returned so
 * no user-facing request ever fails because of the AI layer.
 */

export const AI_NOT_CONFIGURED =
  'AI not configured — set AI_BASE_URL (or AI_API_KEY) and AI_MODEL on the server';

function cfg() {
  return {
    baseURL: process.env.AI_BASE_URL || '',
    apiKey: process.env.AI_API_KEY || '',
    enabled: process.env.AI_ENABLED !== 'false',
    model: process.env.AI_MODEL || '',
    // Local CPU inference can take minutes; GPU servers should keep this low
    // so user-facing suggestion endpoints stay bounded.
    timeoutMs: Number(process.env.AI_TIMEOUT_MS) || 60_000,
  };
}

export function aiMode(): 'live' | 'disabled' {
  const c = cfg();
  return c.enabled && c.model && (c.baseURL || c.apiKey) ? 'live' : 'disabled';
}

/** Map API/connection errors to recruiter-friendly messages. */
export function humanizeAiError(err: unknown): string | null {
  const msg = err instanceof Error ? err.message : String(err);
  if (/ECONNREFUSED|ENOTFOUND|fetch failed|Connection error/i.test(msg)) {
    return 'AI server unreachable. Check that the model server is running at AI_BASE_URL.';
  }
  if (/model.*not found|does not exist|404/i.test(msg)) {
    return `Model "${cfg().model}" not found on the AI server. Check AI_MODEL in .env.`;
  }
  if (/401|invalid.*api key|authentication/i.test(msg)) {
    return 'AI server rejected the API key. Check AI_API_KEY in .env and restart the server.';
  }
  if (/429|rate limit/i.test(msg)) {
    return 'AI server rate limit reached. Wait a moment and retry.';
  }
  return null;
}

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) {
    const c = cfg();
    client = new OpenAI({
      baseURL: c.baseURL || undefined,
      // Local servers (vLLM/Ollama) don't check the key but the SDK requires one.
      apiKey: c.apiKey || 'not-needed',
      // Suggestion endpoints are user-facing: keep latency bounded rather than
      // retrying into a slow success.
      timeout: c.timeoutMs,
      maxRetries: 1,
    });
  }
  return client;
}

/**
 * Small local models sometimes wrap JSON in markdown fences or prose even
 * when a JSON response format is requested; extract the JSON object.
 */
function extractJson(text: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const body = (fenced ? fenced[1] : text).trim();
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  return start >= 0 && end > start ? body.slice(start, end + 1) : body;
}

/** Run a prompt that must return JSON matching `schema`; null on any failure. */
async function jsonCall<T>(
  system: string,
  prompt: string,
  schema: Record<string, unknown>
): Promise<T | null> {
  const result = await jsonCallResult<T>(system, prompt, schema);
  return result.data;
}

/** Like jsonCall but surfaces API errors (connectivity, auth) for user-facing endpoints. */
async function jsonCallResult<T>(
  system: string,
  prompt: string,
  schema: Record<string, unknown>
): Promise<{ data: T | null; error?: string }> {
  if (aiMode() === 'disabled') {
    return { data: null, error: AI_NOT_CONFIGURED };
  }
  try {
    const response = await getClient().chat.completions.create({
      model: cfg().model,
      max_tokens: 4096,
      temperature: 0.2,
      // Structured output: supported by vLLM (guided JSON), Ollama and OpenAI.
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'result', schema },
      },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
    });
    const text = response.choices[0]?.message?.content;
    return { data: text ? (JSON.parse(extractJson(text)) as T) : null };
  } catch (err) {
    console.warn('AI call failed:', (err as Error).message);
    return { data: null, error: humanizeAiError(err) ?? undefined };
  }
}

/** Run a prompt that returns plain text; null on any failure. */
async function textCall(system: string, prompt: string): Promise<string | null> {
  if (aiMode() === 'disabled') return null;
  try {
    const response = await getClient().chat.completions.create({
      model: cfg().model,
      max_tokens: 2048,
      temperature: 0.7,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
    });
    const text = response.choices[0]?.message?.content?.trim();
    return text || null;
  } catch (err) {
    console.warn('AI call failed:', (err as Error).message);
    return null;
  }
}

// ── Message suggestions (WhatsApp inbox + candidate outreach) ──────────

export const MESSAGE_SUGGESTION_COUNT = 10;

export interface SuggestionContext {
  candidateName: string;
  stage: string;
  jobTitle?: string | null;
  jobLocation?: string | null;
  salaryExpectation?: string | null;
  upcomingInterviewAt?: string | null;
  recentMessages?: { direction: 'candidate' | 'recruiter'; content: string }[];
  purpose: 'whatsapp_reply' | 'outreach';
}

const SUGGESTIONS_SCHEMA = {
  type: 'object',
  properties: {
    suggestions: {
      type: 'array',
      items: { type: 'string' },
      description: `Exactly ${MESSAGE_SUGGESTION_COUNT} short candidate-facing messages`,
    },
  },
  required: ['suggestions'],
  additionalProperties: false,
} as const;

export async function suggestMessages(ctx: SuggestionContext): Promise<string[] | null> {
  const conversation = (ctx.recentMessages || [])
    .map((m) => `${m.direction === 'candidate' ? 'Candidate' : 'Recruiter'}: ${m.content}`)
    .join('\n');

  const system =
    'You draft WhatsApp messages a recruiter sends to a job candidate. ' +
    'Messages must be warm, professional, specific to the context, and under 200 characters each. ' +
    'No emoji spam, no placeholders like [date] — if a detail is unknown, phrase the message so it is not needed. ' +
    `Return exactly ${MESSAGE_SUGGESTION_COUNT} distinct options.`;

  const prompt = [
    `Candidate: ${ctx.candidateName} (pipeline stage: ${ctx.stage})`,
    ctx.jobTitle ? `Role: ${ctx.jobTitle}${ctx.jobLocation ? `, ${ctx.jobLocation}` : ''}` : null,
    ctx.salaryExpectation ? `Salary expectation on file: ${ctx.salaryExpectation}` : null,
    ctx.upcomingInterviewAt
      ? `Upcoming interview: ${new Date(ctx.upcomingInterviewAt).toLocaleString()}`
      : null,
    conversation ? `Recent conversation (newest last):\n${conversation}` : null,
    ctx.purpose === 'whatsapp_reply'
      ? `Task: suggest ${MESSAGE_SUGGESTION_COUNT} replies the recruiter could send next in this conversation.`
      : `Task: suggest ${MESSAGE_SUGGESTION_COUNT} outreach messages to move this candidate forward in the pipeline.`,
  ]
    .filter(Boolean)
    .join('\n');

  const result = await jsonCall<{ suggestions: string[] }>(system, prompt, SUGGESTIONS_SCHEMA);
  const suggestions = result?.suggestions?.filter((s) => typeof s === 'string' && s.trim());
  return suggestions?.length ? suggestions.slice(0, MESSAGE_SUGGESTION_COUNT) : null;
}

// ── Candidate screening score ──────────────────────────────────────────

export interface CandidateScoreInput {
  name: string;
  skills: string[];
  experienceYears: number;
  notes?: string | null;
  salaryExpectation?: string | null;
  jobTitle?: string | null;
  jobDescription?: string | null;
  jobLocation?: string | null;
}

export interface CandidateScore {
  score: number; // 0–10, one decimal
  strengths: string[];
  gaps: string[];
  summary: string;
}

const SCORE_SCHEMA = {
  type: 'object',
  properties: {
    score: { type: 'number', description: 'Fit score from 0 to 10, one decimal place' },
    strengths: { type: 'array', items: { type: 'string' } },
    gaps: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string', description: 'One-sentence screening summary, max 150 chars' },
  },
  required: ['score', 'strengths', 'gaps', 'summary'],
  additionalProperties: false,
} as const;

export async function scoreCandidate(input: CandidateScoreInput): Promise<CandidateScore | null> {
  const system =
    'You are a recruitment screening assistant. Score how well a candidate profile fits a role ' +
    'on a 0–10 scale (10 = ideal fit). Base the score only on the provided profile vs the role. ' +
    'If no role details are given, score general employability for the skills listed. Be calibrated: ' +
    'most candidates land between 4 and 8; reserve 9+ for exceptional matches.';

  const prompt = [
    `Candidate: ${input.name}`,
    `Skills: ${input.skills.length ? input.skills.join(', ') : '(none listed)'}`,
    `Experience: ${input.experienceYears} years`,
    input.salaryExpectation ? `Salary expectation: ${input.salaryExpectation}` : null,
    input.notes ? `Recruiter notes: ${input.notes}` : null,
    input.jobTitle
      ? `Role: ${input.jobTitle}${input.jobLocation ? `, ${input.jobLocation}` : ''}`
      : 'Role: not assigned yet',
    input.jobDescription ? `Job description:\n${input.jobDescription}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const result = await jsonCall<CandidateScore>(system, prompt, SCORE_SCHEMA);
  if (!result || typeof result.score !== 'number') return null;
  result.score = Math.round(Math.min(10, Math.max(0, result.score)) * 10) / 10;
  return result;
}

export interface EligibilityAiEnrichment {
  /** Suggested eligibility score 0–10 (caller clamps to ±1 of deterministic base). */
  score: number;
  strengths: string[];
  gaps: string[];
  summary: string;
}

const ELIGIBILITY_SCHEMA = {
  type: 'object',
  properties: {
    score: { type: 'number', description: 'Eligibility 0–10 based on mandatory/preferred skill fit vs JD' },
    strengths: { type: 'array', items: { type: 'string' } },
    gaps: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string', description: 'One-sentence eligibility summary, max 150 chars' },
  },
  required: ['score', 'strengths', 'gaps', 'summary'],
  additionalProperties: false,
} as const;

/**
 * AI enrichment for mass-screen eligibility. Fail-soft — never blocks the fast path.
 * Caller applies ±1 nudge against the deterministic skill score.
 */
export async function scoreEligibilityAgainstJd(input: {
  candidateName: string;
  candidateSkills: string[];
  experienceYears: number;
  resumeExcerpt?: string;
  jobTitle: string;
  jobDescription?: string | null;
  mandatorySkills: string[];
  preferredSkills: string[];
  deterministicScore: number;
  mandatoryMatched: string[];
  mandatoryMissing: string[];
  preferredMatched: string[];
  preferredMissing: string[];
}): Promise<EligibilityAiEnrichment | null> {
  const system =
    'You are a recruitment screening assistant. Given a job and a resume profile, refine an ' +
    'eligibility score (0–10) that is already computed from mandatory and preferred skill match. ' +
    'Stay within ±1 of the deterministic score unless the resume clearly contradicts it. ' +
    'Emphasize mandatory skill gaps as hard blockers. Be concise.';

  const prompt = [
    `Candidate: ${input.candidateName}`,
    `Skills: ${input.candidateSkills.length ? input.candidateSkills.join(', ') : '(none)'}`,
    `Experience: ${input.experienceYears} years`,
    `Role: ${input.jobTitle}`,
    input.jobDescription ? `Job description:\n${input.jobDescription.slice(0, 2500)}` : null,
    `Mandatory skills: ${input.mandatorySkills.join(', ') || '(none)'}`,
    `Preferred skills: ${input.preferredSkills.join(', ') || '(none)'}`,
    `Deterministic eligibility: ${input.deterministicScore}/10`,
    `Mandatory matched: ${input.mandatoryMatched.join(', ') || '(none)'}`,
    `Mandatory missing: ${input.mandatoryMissing.join(', ') || '(none)'}`,
    `Preferred matched: ${input.preferredMatched.join(', ') || '(none)'}`,
    `Preferred missing: ${input.preferredMissing.join(', ') || '(none)'}`,
    input.resumeExcerpt ? `Resume excerpt:\n${input.resumeExcerpt.slice(0, 2000)}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const result = await jsonCall<EligibilityAiEnrichment>(system, prompt, ELIGIBILITY_SCHEMA);
  if (!result || typeof result.score !== 'number') return null;
  result.score = Math.round(Math.min(10, Math.max(0, result.score)) * 10) / 10;
  result.strengths = Array.isArray(result.strengths) ? result.strengths.slice(0, 5) : [];
  result.gaps = Array.isArray(result.gaps) ? result.gaps.slice(0, 5) : [];
  result.summary = String(result.summary || '').slice(0, 200);
  return result;
}

/**
 * Background re-score: fetch the candidate + job, ask the model for a fit score,
 * update ai_score and record the assessment on the candidate's timeline.
 * Fire-and-forget — call sites must not await this on the request path.
 */
export async function rescoreCandidate(tenantId: number, candidateId: number): Promise<void> {
  if (aiMode() === 'disabled') return;
  try {
    const { rows } = await pool.query(
      `SELECT c.name, c.skills, c.experience_years, c.notes, c.salary_expectation,
              j.title AS job_title, j.description AS job_description, j.location AS job_location
       FROM candidates c
       LEFT JOIN jobs j ON j.id = c.job_id AND j.tenant_id = c.tenant_id
       WHERE c.id = $1 AND c.tenant_id = $2`,
      [candidateId, tenantId]
    );
    const c = rows[0];
    if (!c) return;

    const result = await scoreCandidate({
      name: c.name,
      skills: Array.isArray(c.skills) ? c.skills : [],
      experienceYears: Number(c.experience_years) || 0,
      notes: c.notes,
      salaryExpectation: c.salary_expectation,
      jobTitle: c.job_title,
      jobDescription: c.job_description,
      jobLocation: c.job_location,
    });
    if (!result) return;

    await pool.query(
      'UPDATE candidates SET ai_score = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3',
      [result.score, candidateId, tenantId]
    );
    await pool.query(
      `UPDATE applications a SET ai_score = $1, updated_at = NOW()
       FROM candidates c
       WHERE c.id = $2 AND c.tenant_id = $3 AND a.candidate_id = c.id AND a.job_id = c.job_id`,
      [result.score, candidateId, tenantId]
    );
    const detail = [
      result.summary,
      result.strengths.length ? `Strengths: ${result.strengths.slice(0, 3).join('; ')}` : null,
      result.gaps.length ? `Gaps: ${result.gaps.slice(0, 3).join('; ')}` : null,
    ]
      .filter(Boolean)
      .join(' · ');
    await pool.query(
      'INSERT INTO activities (type, description, candidate_id, tenant_id) VALUES ($1, $2, $3, $4)',
      ['screening', `AI screening: ${result.score}/10 — ${detail}`.slice(0, 500), candidateId, tenantId]
    );
  } catch (err) {
    console.warn(`AI rescore failed for candidate ${candidateId}:`, (err as Error).message);
  }
}

// ── Follow-up call script ──────────────────────────────────────────────

export interface FollowUpScriptInput {
  category: string;
  type: string;
  dueAt: string;
  milestoneDay?: number | null;
  candidateName: string;
  stage: string;
  jobTitle?: string | null;
  interviewAt?: string | null;
  expectedJoiningAt?: string | null;
  joinedAt?: string | null;
  priorOutcomes?: { category: string; outcome: string; completedAt: string }[];
}

export async function generateFollowUpScript(input: FollowUpScriptInput): Promise<string | null> {
  const system =
    'You write short call scripts for recruiters following up with job candidates. ' +
    'Output only the script: 2–4 sentences of what the recruiter should say/cover, ' +
    'personalized to the candidate situation. Plain text, no headings, max 350 characters.';

  const outcomes = (input.priorOutcomes || [])
    .map((o) => `${o.category}: ${o.outcome} (${new Date(o.completedAt).toLocaleDateString()})`)
    .join('; ');

  const prompt = [
    `Follow-up type: ${input.category} via ${input.type}, due ${new Date(input.dueAt).toLocaleString()}`,
    input.milestoneDay != null ? `Milestone day: ${input.milestoneDay}` : null,
    `Candidate: ${input.candidateName} (stage: ${input.stage})`,
    input.jobTitle ? `Role: ${input.jobTitle}` : null,
    input.interviewAt ? `Interview at: ${new Date(input.interviewAt).toLocaleString()}` : null,
    input.expectedJoiningAt
      ? `Expected joining: ${new Date(input.expectedJoiningAt).toLocaleDateString()}`
      : null,
    input.joinedAt ? `Joined on: ${new Date(input.joinedAt).toLocaleDateString()}` : null,
    outcomes ? `Previous follow-up outcomes: ${outcomes}` : null,
    'Write the call script for this follow-up.',
  ]
    .filter(Boolean)
    .join('\n');

  return textCall(system, prompt);
}

// ── Follow-up WhatsApp message ─────────────────────────────────────────

export interface FollowUpMessageInput extends FollowUpScriptInput {
  meetingLink?: string | null;
}

export async function generateFollowUpMessage(input: FollowUpMessageInput): Promise<string | null> {
  const system =
    'You write short WhatsApp messages a recruiter sends to a job candidate. ' +
    'Warm, professional, under 400 characters. Use *text* for bold (WhatsApp style). ' +
    'For interview scheduling/confirmation messages, the candidate must be asked to reply *CONFIRMED*. ' +
    'Plain text only — no markdown headers.';

  const outcomes = (input.priorOutcomes || [])
    .map((o) => `${o.category}: ${o.outcome} (${new Date(o.completedAt).toLocaleDateString()})`)
    .join('; ');

  const prompt = [
    `Follow-up type: ${input.category} via ${input.type}, due ${new Date(input.dueAt).toLocaleString()}`,
    input.milestoneDay != null ? `Milestone day: ${input.milestoneDay}` : null,
    `Candidate: ${input.candidateName} (stage: ${input.stage})`,
    input.jobTitle ? `Role: ${input.jobTitle}` : null,
    input.interviewAt ? `Interview at: ${new Date(input.interviewAt).toLocaleString()}` : null,
    input.meetingLink ? `Video interview link: ${input.meetingLink}` : null,
    input.expectedJoiningAt
      ? `Expected joining: ${new Date(input.expectedJoiningAt).toLocaleDateString()}`
      : null,
    input.joinedAt ? `Joined on: ${new Date(input.joinedAt).toLocaleDateString()}` : null,
    outcomes ? `Previous follow-up outcomes: ${outcomes}` : null,
    'Write the WhatsApp message to send for this follow-up.',
  ]
    .filter(Boolean)
    .join('\n');

  return textCall(system, prompt);
}

export async function generateInterviewScheduledMessage(input: {
  candidateName: string;
  jobTitle?: string | null;
  interviewAt: string;
  meetingLink?: string | null;
}): Promise<string | null> {
  const system =
    'You write a WhatsApp interview confirmation message for a recruiter. ' +
    'Thank the candidate, state the interview date/time, include the video link if provided, ' +
    'and ask them to reply *CONFIRMED*. Under 450 characters. Use *CONFIRMED* and *text* for bold.';

  const prompt = [
    `Candidate: ${input.candidateName}`,
    input.jobTitle ? `Role: ${input.jobTitle}` : null,
    `Interview: ${new Date(input.interviewAt).toLocaleString()}`,
    input.meetingLink ? `Join link: ${input.meetingLink}` : null,
    'Write the confirmation WhatsApp message.',
  ]
    .filter(Boolean)
    .join('\n');

  return textCall(system, prompt);
}

// ── Candidate fit score (sync path for create/import) ────────────────────

export function heuristicCandidateScore(skills: string[], years: number): number {
  const base = Math.min(10, 5 + years * 0.4 + skills.length * 0.3);
  return Math.round(base * 10) / 10;
}

export async function resolveCandidateAiScore(
  tenantId: number,
  input: {
    name: string;
    skills: string[];
    experienceYears: number;
    notes?: string | null;
    salaryExpectation?: string | null;
    jobId?: number | null;
  }
): Promise<number> {
  if (aiMode() !== 'live') {
    return heuristicCandidateScore(input.skills, input.experienceYears);
  }

  let jobTitle: string | null = null;
  let jobDescription: string | null = null;
  let jobLocation: string | null = null;
  if (input.jobId) {
    const { rows } = await pool.query(
      'SELECT title, description, location FROM jobs WHERE id = $1 AND tenant_id = $2',
      [input.jobId, tenantId]
    );
    jobTitle = rows[0]?.title ?? null;
    jobDescription = rows[0]?.description ?? null;
    jobLocation = rows[0]?.location ?? null;
  }

  const result = await scoreCandidate({
    name: input.name,
    skills: input.skills,
    experienceYears: input.experienceYears,
    notes: input.notes,
    salaryExpectation: input.salaryExpectation,
    jobTitle,
    jobDescription,
    jobLocation,
  });
  return result?.score ?? heuristicCandidateScore(input.skills, input.experienceYears);
}

// ── Resume text refinement (sparse OCR / extraction cleanup) ───────────

export async function refineResumeText(text: string, filename: string): Promise<string | null> {
  if (aiMode() === 'disabled' || !text.trim()) return null;
  const system =
    'You clean up resume text extracted from a PDF or DOCX. ' +
    'Fix broken line breaks and OCR glitches, preserve all factual content, ' +
    'and output plain resume text only — no commentary.';
  const prompt = [
    `Filename: ${filename}`,
    'Extracted text (may be noisy or fragmented):',
    text.slice(0, 80_000),
    'Return the cleaned full resume text.',
  ].join('\n\n');
  return textCall(system, prompt);
}

// ── Screening questions from JD, role, experience band, and sector ─────
//
// Job-level packs are generated once and reused. When `candidate` is provided
// (explicit regenerate from resume/projects), the pack is personalized.

export interface ScreeningCandidateContext {
  name?: string | null;
  professional_summary?: string | null;
  skills?: string[];
  technical_skills?: string[];
  experience_years?: number | null;
  experience?: Array<{ title?: string; company?: string; description?: string | null }>;
  projects?: Array<{ name: string; description?: string | null; technologies?: string[] }>;
}

export interface ScreeningQuestionsInput {
  title: string;
  description?: string | null;
  client?: string | null;
  location?: string | null;
  /** Work arrangement: On-site / Remote / Hybrid. */
  job_type?: string | null;
  /** Sector of the opening (Information Technology, BPO, Insurance, …). */
  industry?: string | null;
  min_experience?: number | null;
  max_experience?: number | null;
  /** Structured skills from the job record — the best expected-keyword source. */
  required_skills?: string[] | null;
  /** Target total seconds for first-call screening (default 300 = 5 min). */
  screening_duration_seconds?: number;
  /** Target total seconds for scheduled interview questions (default 900 = 15 min). */
  scheduled_duration_seconds?: number;
  /** When set, questions are personalized to this candidate's resume/projects. */
  candidate?: ScreeningCandidateContext | null;
}

export interface GeneratedScreeningQuestion {
  id: string;
  label: string;
  hint: string;
  requirement?: string;
  category?: string;
  time_seconds?: number;
  expected_keywords?: string[];
  strong_answer?: string;
  weak_answer?: string;
}

export interface GeneratedScreeningQuestions {
  prescreen: GeneratedScreeningQuestion[];
  interview: GeneratedScreeningQuestion[];
}

const SCREENING_QUESTION_ITEM_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'snake_case unique identifier' },
    label: { type: 'string', description: 'Short question title for the recruiter' },
    hint: { type: 'string', description: 'What to listen for when scoring 1-5' },
    requirement: { type: 'string', description: 'Which JD requirement or resume project this probes' },
    category: {
      type: 'string',
      description: 'introduction, technical, domain, behavioral, or goals (scheduled/interview only)',
    },
    time_seconds: {
      type: 'number',
      description: 'Suggested speaking time in seconds for this question',
    },
    expected_keywords: {
      type: 'array',
      items: { type: 'string' },
      description:
        '4-8 specific terms a strong answer should contain (tools, metrics, domain vocabulary). '
        + 'The recruiter ticks off what they actually hear. No filler words.',
    },
    strong_answer: { type: 'string', description: 'What a 4-5 answer sounds like, one sentence' },
    weak_answer: { type: 'string', description: 'What a 1-2 answer sounds like, one sentence' },
  },
  required: ['id', 'label', 'hint', 'time_seconds', 'expected_keywords', 'strong_answer', 'weak_answer'],
  additionalProperties: false,
} as const;

const SCREENING_QUESTIONS_SCHEMA = {
  type: 'object',
  properties: {
    prescreen: {
      type: 'array',
      items: SCREENING_QUESTION_ITEM_SCHEMA,
      description: '4-5 first-call screening questions whose time_seconds sum to at most the screening budget',
    },
    interview: {
      type: 'array',
      items: SCREENING_QUESTION_ITEM_SCHEMA,
      description: '6-10 scheduled interview questions whose time_seconds sum to at most the scheduled budget',
    },
  },
  required: ['prescreen', 'interview'],
  additionalProperties: false,
} as const;

function formatExperienceRange(input: ScreeningQuestionsInput): string | null {
  const min = input.min_experience != null ? Number(input.min_experience) : null;
  const max = input.max_experience != null ? Number(input.max_experience) : null;
  if (min == null && max == null) return null;
  if (min != null && max != null) return `Experience required: ${min}–${max} years`;
  if (min != null) return `Experience required: ${min}+ years`;
  return `Experience required: up to ${max} years`;
}

function formatCandidateContext(candidate: ScreeningCandidateContext): string {
  const lines: string[] = [];
  if (candidate.name) lines.push(`Candidate name: ${candidate.name}`);
  if (candidate.professional_summary) lines.push(`Summary: ${candidate.professional_summary}`);
  if (candidate.experience_years != null) lines.push(`Years of experience: ${candidate.experience_years}`);
  const skills = [...(candidate.technical_skills || []), ...(candidate.skills || [])];
  if (skills.length) lines.push(`Skills: ${[...new Set(skills)].slice(0, 20).join(', ')}`);
  if (candidate.experience?.length) {
    const exp = candidate.experience
      .slice(0, 4)
      .map((e) => `- ${e.title || 'Role'} at ${e.company || 'Company'}${e.description ? `: ${e.description.slice(0, 160)}` : ''}`)
      .join('\n');
    lines.push(`Recent experience:\n${exp}`);
  }
  if (candidate.projects?.length) {
    const projects = candidate.projects
      .slice(0, 6)
      .map((p) => {
        const tech = p.technologies?.length ? ` [${p.technologies.slice(0, 6).join(', ')}]` : '';
        return `- ${p.name}${tech}${p.description ? `: ${p.description.slice(0, 160)}` : ''}`;
      })
      .join('\n');
    lines.push(`Projects undertaken:\n${projects}`);
  }
  return lines.join('\n');
}

export async function generateScreeningQuestionsFromJd(
  input: ScreeningQuestionsInput
): Promise<GeneratedScreeningQuestions | null> {
  const screeningBudget = input.screening_duration_seconds ?? 300;
  const scheduledBudget = input.scheduled_duration_seconds ?? 900;
  const personalized = Boolean(input.candidate);

  const system =
    'You generate recruitment screening questions from a job description' +
    (personalized ? ', personalized using the candidate resume and projects.' : '.') +
    ' Screening (prescreen) questions are for a short first call — commitment, motivation, and role fit. ' +
    'Scheduled (interview) questions probe JD requirements, technical depth, domain knowledge, and behavioral fit. ' +
    'Each question must map to a real JD requirement' +
    (personalized ? ' and, when candidate context is provided, reference specific skills or projects by name.' : '.') +
    ' Respect hard time budgets: screening questions time_seconds must sum to ≤ screening budget; ' +
    'scheduled questions time_seconds must sum to ≤ scheduled budget. ' +
    'Prefer fewer deeper questions over many shallow ones. ' +
    'Use clear, recruiter-friendly labels and actionable scoring hints (what 1 vs 5 sounds like). ' +
    'Interview categories: introduction, technical, domain, behavioral, goals. ' +
    'IDs must be unique snake_case strings. Every question needs time_seconds. '
    + 'Every question must also carry expected_keywords — the concrete terms a good answer contains (tools, metrics, domain vocabulary) so the recruiter can tick off what they hear — plus a one-sentence strong_answer and weak_answer. Keywords must be specific to this role and industry; never generic filler like "communication" or "teamwork".';

  const prompt = [
    `Job title / role: ${input.title}`,
    input.industry ? `Industry / sector: ${input.industry}` : null,
    input.job_type ? `Job type (work arrangement): ${input.job_type}` : null,
    formatExperienceRange(input),
    input.required_skills?.length ? `Required skills: ${input.required_skills.join(', ')}` : null,
    input.client ? `Client: ${input.client}` : null,
    input.location ? `Location: ${input.location}` : null,
    input.description ? `Job description:\n${input.description}` : null,
    input.candidate
      ? `Candidate profile (personalize questions from this):\n${formatCandidateContext(input.candidate)}`
      : null,
    `Screening budget: ${screeningBudget} seconds (~${Math.round(screeningBudget / 60)} minutes). Generate 4-5 prescreen questions; each typically 45-60s; total ≤ ${screeningBudget}s.`,
    `Scheduled budget: ${scheduledBudget} seconds (~${Math.round(scheduledBudget / 60)} minutes). Generate 6-10 interview questions; total ≤ ${scheduledBudget}s.`,
    personalized
      ? 'Include at least 1-2 scheduled questions that specifically probe the candidate\'s listed projects or resume experience against the JD.'
      : 'Derive every question from the JD title, industry, required experience range, and requirements. ' +
        'Pitch depth at the required experience level: freshers get fundamentals and trainability, ' +
        'senior roles get ownership, trade-offs, and scale.',
  ]
    .filter(Boolean)
    .join('\n\n');

  const result = await jsonCall<GeneratedScreeningQuestions>(system, prompt, SCREENING_QUESTIONS_SCHEMA);
  if (!result?.prescreen?.length || !result?.interview?.length) return null;
  return result;
}

// ── Job description generation ─────────────────────────────────────────

export interface JobDescriptionInput {
  title: string;
  client?: string | null;
  location?: string | null;
  openPositions?: number | null;
  notes?: string | null;
}

export async function generateJobDescription(input: JobDescriptionInput): Promise<string | null> {
  const system =
    'You write job descriptions for a recruitment agency. Output plain text (no markdown headers) ' +
    'with short sections: role summary, Key Responsibilities (3-5 bullets using "- "), ' +
    'Requirements (3-5 bullets), and What We Offer. Keep it under 300 words. ' +
    'Infer realistic, role-specific responsibilities and skills from the job title ' +
    '(e.g. Java Developer → Spring Boot, REST APIs, microservices; Telecaller → outbound calls, CRM). ' +
    'Avoid generic filler like "contribute to team goals" or "demonstrable aptitude for the role". ' +
    'Do not invent salary figures or company facts not provided.';

  const prompt = [
    `Job title: ${input.title}`,
    input.client ? `Hiring company: ${input.client}` : null,
    input.location ? `Location: ${input.location}` : null,
    input.openPositions ? `Open positions: ${input.openPositions}` : null,
    input.notes ? `Extra notes from the recruiter: ${input.notes}` : null,
    'Write the job description.',
  ]
    .filter(Boolean)
    .join('\n');

  return textCall(system, prompt);
}

// ── Resume parsing ─────────────────────────────────────────────────────

export interface ParsedExperience {
  title: string;
  company: string;
  start_date?: string | null;
  end_date?: string | null;
  description?: string | null;
}

export interface ParsedEducation {
  degree: string;
  institution: string;
  year?: string | null;
}

export interface ParsedProject {
  name: string;
  description?: string | null;
  technologies?: string[];
}

export interface ParsedCertification {
  name: string;
  issuer?: string | null;
  date?: string | null;
}

export interface ParsedProfile {
  name: string;
  email?: string | null;
  phone?: string | null;
  linkedin?: string | null;
  github?: string | null;
  portfolio?: string | null;
  current_company?: string | null;
  previous_companies?: string[];
  experience?: ParsedExperience[];
  education?: ParsedEducation[];
  projects?: ParsedProject[];
  skills?: string[];
  technical_skills?: string[];
  soft_skills?: string[];
  certifications?: ParsedCertification[];
  current_salary?: string | null;
  expected_salary?: string | null;
  notice_period?: string | null;
  current_location?: string | null;
  preferred_location?: string | null;
  languages?: string[];
  professional_summary?: string | null;
  total_experience_years?: number | null;
  confidence: number;
}

const PARSED_EXPERIENCE_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    company: { type: 'string' },
    start_date: { type: ['string', 'null'] },
    end_date: { type: ['string', 'null'] },
    description: { type: ['string', 'null'] },
  },
  required: ['title', 'company'],
  additionalProperties: false,
} as const;

const PARSED_EDUCATION_SCHEMA = {
  type: 'object',
  properties: {
    degree: { type: 'string' },
    institution: { type: 'string' },
    year: { type: ['string', 'null'] },
  },
  required: ['degree', 'institution'],
  additionalProperties: false,
} as const;

const PARSED_PROJECT_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    description: { type: ['string', 'null'] },
    technologies: { type: 'array', items: { type: 'string' } },
  },
  required: ['name'],
  additionalProperties: false,
} as const;

const PARSED_CERTIFICATION_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    issuer: { type: ['string', 'null'] },
    date: { type: ['string', 'null'] },
  },
  required: ['name'],
  additionalProperties: false,
} as const;

const PARSE_RESUME_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    email: { type: ['string', 'null'] },
    phone: { type: ['string', 'null'] },
    linkedin: { type: ['string', 'null'] },
    github: { type: ['string', 'null'] },
    portfolio: { type: ['string', 'null'] },
    current_company: { type: ['string', 'null'] },
    previous_companies: { type: 'array', items: { type: 'string' } },
    experience: { type: 'array', items: PARSED_EXPERIENCE_SCHEMA },
    education: { type: 'array', items: PARSED_EDUCATION_SCHEMA },
    projects: { type: 'array', items: PARSED_PROJECT_SCHEMA },
    skills: { type: 'array', items: { type: 'string' } },
    technical_skills: { type: 'array', items: { type: 'string' } },
    soft_skills: { type: 'array', items: { type: 'string' } },
    certifications: { type: 'array', items: PARSED_CERTIFICATION_SCHEMA },
    current_salary: { type: ['string', 'null'] },
    expected_salary: { type: ['string', 'null'] },
    notice_period: { type: ['string', 'null'] },
    current_location: { type: ['string', 'null'] },
    preferred_location: { type: ['string', 'null'] },
    languages: { type: 'array', items: { type: 'string' } },
    professional_summary: { type: ['string', 'null'] },
    total_experience_years: { type: ['number', 'null'] },
    confidence: {
      type: 'number',
      description: 'Self-assessed extraction confidence from 0.0 to 1.0',
    },
  },
  required: ['name', 'confidence'],
  additionalProperties: false,
} as const;

/** Derive a confidence score from field completeness when AI self-score is missing. */
export function computeParseConfidence(profile: ParsedProfile): number {
  const checks = [
    profile.name,
    profile.email,
    profile.phone,
    profile.skills?.length,
    profile.experience?.length,
    profile.education?.length,
    profile.professional_summary,
  ];
  const filled = checks.filter((v) => (Array.isArray(v) ? v.length > 0 : Boolean(v))).length;
  const heuristic = Math.min(1, filled / checks.length);
  const raw = typeof profile.confidence === 'number' && !Number.isNaN(profile.confidence)
    ? profile.confidence
    : heuristic;
  return Math.round(Math.min(1, Math.max(0, raw)) * 100) / 100;
}

export async function parseResume(
  text: string,
  filename: string
): Promise<{ profile: ParsedProfile | null; error?: string }> {
  if (!text.trim()) {
    return { profile: null, error: 'Resume text is empty after extraction.' };
  }

  const system =
    'You extract structured candidate profile data from resume text for a recruitment ATS. ' +
    'Only include information explicitly present or clearly inferable from the resume. ' +
    'Use null for missing scalar fields and empty arrays for missing lists. ' +
    'Normalize phone numbers with country code when possible. ' +
    'Split skills into general skills, technical_skills, and soft_skills when distinguishable. ' +
    'Set confidence (0.0–1.0) based on how complete and unambiguous the extraction is.';

  const prompt = [
    `Resume filename: ${filename}`,
    'Resume text:',
    text.slice(0, 24_000),
    'Extract all available profile fields.',
  ].join('\n\n');

  const { data: result, error } = await jsonCallResult<ParsedProfile>(
    system,
    prompt,
    PARSE_RESUME_SCHEMA
  );
  if (error) return { profile: null, error };
  if (!result?.name?.trim()) {
    return { profile: null, error: 'AI could not extract a candidate name from this resume.' };
  }

  result.confidence = computeParseConfidence(result);
  if (result.total_experience_years != null) {
    result.total_experience_years =
      Math.round(Math.max(0, Number(result.total_experience_years)) * 10) / 10;
  }

  return { profile: result };
}

// ── People search filter extraction (Sourcing Copilot) ─────────────────

const PEOPLE_FILTERS_SCHEMA = {
  type: 'object',
  properties: {
    jobTitle: { type: ['string', 'null'], description: 'Job title being hired for' },
    skills: {
      type: 'array',
      items: { type: 'string' },
      description: 'Technical or domain skills explicitly mentioned',
    },
    seniorityLevels: {
      type: 'array',
      items: { type: 'string', enum: [...PDL_SENIORITY_LEVELS] },
      description: 'Seniority levels implied by the request',
    },
    minExperienceYears: { type: ['number', 'null'] },
    maxExperienceYears: { type: ['number', 'null'] },
    city: { type: ['string', 'null'] },
    country: { type: ['string', 'null'] },
  },
  required: ['skills', 'seniorityLevels'],
  additionalProperties: false,
} as const;

interface ExtractedPeopleFilters {
  jobTitle?: string | null;
  skills?: string[];
  seniorityLevels?: string[];
  minExperienceYears?: number | null;
  maxExperienceYears?: number | null;
  city?: string | null;
  country?: string | null;
}

/** NL recruiter request → candidate-search filters. Null when AI is disabled or fails. */
export async function extractPeopleSearchFilters(
  text: string
): Promise<Partial<PeopleSearchFilters> | null> {
  if (aiMode() === 'disabled' || !text.trim()) return null;

  const system =
    'You extract candidate-search filters from a recruiter request. ' +
    'Only include values explicitly stated or strongly implied — never invent skills, ' +
    'locations, or experience ranges. Skills are lowercase short terms (e.g. "react", "voice process"). ' +
    `Seniority levels must come from: ${PDL_SENIORITY_LEVELS.join(', ')}. ` +
    '"5+ years" means minExperienceYears 5; "fresher" means maxExperienceYears 1.';

  const result = await jsonCall<ExtractedPeopleFilters>(
    system,
    `Recruiter request: ${text.slice(0, 1000)}`,
    PEOPLE_FILTERS_SCHEMA as unknown as Record<string, unknown>
  );
  if (!result) return null;

  const filters: Partial<PeopleSearchFilters> = {};
  if (result.jobTitle?.trim()) filters.jobTitle = result.jobTitle.trim();
  if (result.skills?.length) filters.skills = result.skills.filter(Boolean).slice(0, 20);
  if (result.seniorityLevels?.length) filters.seniorityLevels = result.seniorityLevels;
  if (typeof result.minExperienceYears === 'number' && result.minExperienceYears >= 0) {
    filters.minExperienceYears = result.minExperienceYears;
  }
  if (typeof result.maxExperienceYears === 'number' && result.maxExperienceYears >= 0) {
    filters.maxExperienceYears = result.maxExperienceYears;
  }
  if (result.city?.trim()) filters.city = result.city.trim();
  if (result.country?.trim()) filters.country = result.country.trim();
  return filters;
}
