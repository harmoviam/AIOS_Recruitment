import OpenAI from 'openai';
import { pool } from '../dbConfig.js';

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
    text.slice(0, 120_000),
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
