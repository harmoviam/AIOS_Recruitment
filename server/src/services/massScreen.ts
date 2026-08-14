import { randomUUID } from 'crypto';
import { pool } from '../db.js';
import {
  scoreEligibilityAgainstJd,
  type ParsedProfile,
} from './ai.js';
import { computeAtsScore, type AtsScoreResult } from './atsScore.js';
import {
  applyEligibilityNudge,
  computeEligibilityScore,
  evaluateExperienceGate,
  type EligibilityScoreResult,
  type ExperienceGateResult,
} from './eligibilityScore.js';
import {
  finalizePendingResume,
  isAllowedMimeType,
  savePendingResume,
} from './fileStorage.js';
import { extractAndParseResume } from './parserService.js';
import { syncPrimaryApplication } from './applications.js';
import {
  analyzeExperienceConsistency,
  type ExperienceConsistencyResult,
} from './experienceConsistency.js';

export const MASS_SCREEN_MAX_FILES = 3;
/** Per-batch parallel parse workers (capped further by the global gate). */
const PARSE_CONCURRENCY = Math.max(
  1,
  Number(process.env.MASS_SCREEN_PARSE_CONCURRENCY) || 3
);
/** Per-batch parallel AI enrichment workers (capped further by the global gate). */
const AI_CONCURRENCY = Math.max(1, Number(process.env.MASS_SCREEN_AI_CONCURRENCY) || 2);
/**
 * Global caps across ALL recruiter batches on this API process.
 * Without these, 4 recruiters × 3 resumes can stampede the parser / LLM.
 */
const GLOBAL_PARSE_LIMIT = Math.max(
  1,
  Number(process.env.MASS_SCREEN_GLOBAL_PARSE_LIMIT) || 4
);
const GLOBAL_AI_LIMIT = Math.max(1, Number(process.env.MASS_SCREEN_GLOBAL_AI_LIMIT) || 2);

export type MassScreenSlotStatus =
  | 'queued'
  | 'parsing'
  | 'scored'
  | 'error'
  | 'decided'
  | 'skipped';

export type MassScreenAiStatus = 'pending' | 'done' | 'skipped';

export interface MassScreenSlot {
  slot: number;
  status: MassScreenSlotStatus;
  filename?: string;
  error?: string;
  pending_resume_id?: string;
  pending_ext?: string;
  original_filename?: string;
  mime_type?: string;
  file_size_bytes?: number;
  parsed_profile?: ParsedProfile;
  /** Truncated resume text kept for AI enrichment only. */
  resume_excerpt?: string;
  ats_score?: number;
  ats_score_10?: number;
  ats?: AtsScoreResult;
  eligibility_score?: number;
  eligibility?: EligibilityScoreResult;
  /** Years of experience extracted from the resume. */
  experience_years?: number;
  /** Job min_experience used for the hard gate (null when unset). */
  min_experience_required?: number | null;
  /** True when YOE < job min — ATS/eligibility/AI were skipped. */
  experience_rejected?: boolean;
  experience_gate?: ExperienceGateResult;
  /** Employment-history vs summary YOE consistency. */
  experience_consistency?: ExperienceConsistencyResult;
  ai_status?: MassScreenAiStatus;
  ai_summary?: string;
  ai_strengths?: string[];
  ai_gaps?: string[];
  decision?: 'shortlisted' | 'rejected';
  remarks?: string;
  candidate_id?: number;
}

export interface MassScreenBatch {
  id: string;
  tenant_id: number;
  job_id: number;
  created_by: number | null;
  status: 'processing' | 'ready' | 'completed';
  slots: MassScreenSlot[];
  created_at?: string;
  updated_at?: string;
}

interface JobScreenContext {
  id: number;
  title: string;
  description: string | null;
  required_skills: string[];
  preferred_skills: string[];
  required_qualification: string | null;
  min_experience: number | null;
}

async function loadJob(tenantId: number, jobId: number): Promise<JobScreenContext | null> {
  const { rows } = await pool.query(
    `SELECT id, title, description, required_skills, preferred_skills,
            required_qualification, min_experience
     FROM jobs WHERE id = $1 AND tenant_id = $2`,
    [jobId, tenantId]
  );
  if (!rows[0]) return null;
  return {
    id: rows[0].id,
    title: rows[0].title,
    description: rows[0].description,
    required_skills: Array.isArray(rows[0].required_skills) ? rows[0].required_skills : [],
    preferred_skills: Array.isArray(rows[0].preferred_skills) ? rows[0].preferred_skills : [],
    required_qualification: rows[0].required_qualification,
    min_experience: rows[0].min_experience,
  };
}

async function saveBatchSlots(
  batchId: string,
  tenantId: number,
  slots: MassScreenSlot[],
  status?: MassScreenBatch['status']
): Promise<void> {
  if (status) {
    await pool.query(
      `UPDATE mass_screen_batches
       SET slots = $1::jsonb, status = $2, updated_at = NOW()
       WHERE id = $3 AND tenant_id = $4`,
      [JSON.stringify(slots), status, batchId, tenantId]
    );
  } else {
    await pool.query(
      `UPDATE mass_screen_batches
       SET slots = $1::jsonb, updated_at = NOW()
       WHERE id = $2 AND tenant_id = $3`,
      [JSON.stringify(slots), batchId, tenantId]
    );
  }
}

export async function getMassScreenBatch(
  tenantId: number,
  batchId: string
): Promise<MassScreenBatch | null> {
  const { rows } = await pool.query(
    `SELECT id, tenant_id, job_id, created_by, status, slots, created_at, updated_at
     FROM mass_screen_batches
     WHERE id = $1 AND tenant_id = $2 AND expires_at > NOW()`,
    [batchId, tenantId]
  );
  if (!rows[0]) return null;
  return {
    id: rows[0].id,
    tenant_id: rows[0].tenant_id,
    job_id: rows[0].job_id,
    created_by: rows[0].created_by,
    status: rows[0].status,
    slots: Array.isArray(rows[0].slots) ? rows[0].slots : [],
    created_at: rows[0].created_at,
    updated_at: rows[0].updated_at,
  };
}

/** Public batch payload — omit resume_excerpt from client responses. */
export function publicBatch(batch: MassScreenBatch) {
  return {
    ...batch,
    slots: batch.slots.map(({ resume_excerpt: _omit, ...slot }) => slot),
  };
}

async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let index = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index++];
      await worker(current);
    }
  });
  await Promise.all(runners);
}

/** Simple promise semaphore — shared across all in-flight mass-screen batches. */
function createSemaphore(limit: number) {
  let active = 0;
  const waiters: Array<() => void> = [];
  return async function withPermit<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= limit) {
      await new Promise<void>((resolve) => waiters.push(resolve));
    }
    active += 1;
    try {
      return await fn();
    } finally {
      active -= 1;
      const next = waiters.shift();
      if (next) next();
    }
  };
}

const withGlobalParseSlot = createSemaphore(GLOBAL_PARSE_LIMIT);
const withGlobalAiSlot = createSemaphore(GLOBAL_AI_LIMIT);

/** Serialize DB slot writes per batch so parallel workers don't clobber each other. */
const batchSaveChains = new Map<string, Promise<void>>();

async function saveBatchSlotsSafe(
  batchId: string,
  tenantId: number,
  getSlots: () => MassScreenSlot[],
  status?: MassScreenBatch['status']
): Promise<void> {
  const prev = batchSaveChains.get(batchId) || Promise.resolve();
  const next = prev
    .catch(() => undefined)
    .then(() => saveBatchSlots(batchId, tenantId, getSlots(), status));
  batchSaveChains.set(
    batchId,
    next.finally(() => {
      if (batchSaveChains.get(batchId) === next) batchSaveChains.delete(batchId);
    })
  );
  await next;
}

function mergeSkills(profile: ParsedProfile): string[] {
  const all = [...(profile.skills || []), ...(profile.technical_skills || [])];
  return [...new Set(all.map((s) => String(s).trim()).filter(Boolean))];
}

function buildResumeMeta(opts: {
  storage_path: string;
  original_filename: string;
  mime_type: string;
  file_size_bytes: number;
  ai_confidence: number;
}) {
  return {
    ...opts,
    parsed_at: new Date().toISOString(),
  };
}

async function processSlot(
  tenantId: number,
  job: JobScreenContext,
  file: Express.Multer.File,
  slot: MassScreenSlot
): Promise<MassScreenSlot> {
  const next: MassScreenSlot = {
    ...slot,
    status: 'parsing',
    filename: file.originalname,
    original_filename: file.originalname,
    mime_type: file.mimetype,
    file_size_bytes: file.size,
  };

  if (!isAllowedMimeType(file.mimetype)) {
    return {
      ...next,
      status: 'error',
      error: 'Unsupported file type. Use PDF, DOC, or DOCX.',
      ai_status: 'skipped',
    };
  }

  try {
    const { profile: parsed, text, error: parseError } = await extractAndParseResume(
      file.buffer,
      file.mimetype,
      file.originalname
    );
    if (!parsed) {
      return {
        ...next,
        status: 'error',
        error: parseError || 'Could not parse this resume.',
        ai_status: 'skipped',
      };
    }

    const { pendingId, ext } = await savePendingResume(
      tenantId,
      file.buffer,
      file.originalname,
      file.mimetype
    );

    const consistency = analyzeExperienceConsistency({
      profile: parsed,
      resumeText: text || '',
    });
    if (consistency.effective_years != null) {
      parsed.total_experience_years = consistency.effective_years;
    }

    const experienceYears = Number(parsed.total_experience_years) || 0;
    const experienceGate = evaluateExperienceGate(experienceYears, job.min_experience);

    // Hard YOE gate: reject early — skip ATS, skill eligibility, and AI JD enrichment.
    if (!experienceGate.passed) {
      return {
        ...next,
        status: 'scored',
        pending_resume_id: pendingId,
        pending_ext: ext,
        parsed_profile: parsed,
        resume_excerpt: undefined,
        experience_years: experienceGate.candidate_years,
        min_experience_required: experienceGate.required_years,
        experience_rejected: true,
        experience_gate: experienceGate,
        experience_consistency: consistency,
        remarks: experienceGate.reason || undefined,
        ai_status: 'skipped',
      };
    }

    const ats = computeAtsScore(parsed, text || '', {
      title: job.title,
      required_skills: job.required_skills,
      required_qualification: job.required_qualification,
      min_experience: job.min_experience,
    });
    const eligibility = computeEligibilityScore(parsed, text || '', job);
    const ats10 = Math.round((ats.score / 10) * 10) / 10;

    return {
      ...next,
      status: 'scored',
      pending_resume_id: pendingId,
      pending_ext: ext,
      parsed_profile: parsed,
      resume_excerpt: (text || '').slice(0, 4000),
      experience_years: experienceGate.candidate_years,
      min_experience_required: experienceGate.required_years,
      experience_rejected: false,
      experience_gate: experienceGate,
      experience_consistency: consistency,
      ats_score: ats.score,
      ats_score_10: ats10,
      ats,
      eligibility_score: eligibility.score,
      eligibility,
      ai_status: 'pending',
    };
  } catch (err) {
    return {
      ...next,
      status: 'error',
      error: (err as Error).message || 'Failed to process resume',
      ai_status: 'skipped',
    };
  }
}

async function enrichSlotWithAi(
  job: JobScreenContext,
  slot: MassScreenSlot
): Promise<MassScreenSlot> {
  if (slot.status !== 'scored' || !slot.parsed_profile || !slot.eligibility) {
    return { ...slot, ai_status: 'skipped' };
  }
  if (slot.experience_rejected) {
    return { ...slot, ai_status: 'skipped' };
  }

  try {
    const profile = slot.parsed_profile;
    const skills = mergeSkills(profile);
    const enrichment = await scoreEligibilityAgainstJd({
      candidateName: profile.name || slot.filename || 'Candidate',
      candidateSkills: skills,
      experienceYears: Number(profile.total_experience_years) || 0,
      resumeExcerpt: slot.resume_excerpt,
      jobTitle: job.title,
      jobDescription: job.description,
      mandatorySkills: job.required_skills,
      preferredSkills: job.preferred_skills,
      deterministicScore: slot.eligibility.score,
      mandatoryMatched: slot.eligibility.mandatory_matched,
      mandatoryMissing: slot.eligibility.mandatory_missing,
      preferredMatched: slot.eligibility.preferred_matched,
      preferredMissing: slot.eligibility.preferred_missing,
    });

    if (!enrichment) {
      return { ...slot, ai_status: 'skipped' };
    }

    const nudged = applyEligibilityNudge(slot.eligibility.score, enrichment.score);
    return {
      ...slot,
      eligibility_score: nudged,
      eligibility: { ...slot.eligibility, score: nudged },
      ai_status: 'done',
      ai_summary: enrichment.summary,
      ai_strengths: enrichment.strengths,
      ai_gaps: enrichment.gaps,
    };
  } catch {
    return { ...slot, ai_status: 'skipped' };
  }
}

function recomputeBatchStatus(slots: MassScreenSlot[]): MassScreenBatch['status'] {
  if (slots.some((s) => s.status === 'queued' || s.status === 'parsing')) {
    return 'processing';
  }
  const actionable = slots.filter((s) => s.status === 'scored' || s.status === 'decided');
  if (actionable.length === 0) {
    // All failed/skipped — nothing left to decide.
    return 'completed';
  }
  if (actionable.every((s) => s.status === 'decided')) {
    return 'completed';
  }
  // Keep "processing" while AI enrichment is still pending so clients keep polling.
  if (slots.some((s) => s.status === 'scored' && s.ai_status === 'pending')) {
    return 'processing';
  }
  return 'ready';
}

/**
 * Create a batch, persist queued slots, return immediately, then parse/score in background.
 */
export async function createMassScreenBatch(input: {
  tenantId: number;
  jobId: number;
  userId: number;
  files: Array<{ slot: number; file: Express.Multer.File }>;
}): Promise<MassScreenBatch> {
  const job = await loadJob(input.tenantId, input.jobId);
  if (!job) throw Object.assign(new Error('Job not found'), { status: 404 });
  if (job.required_skills.length === 0) {
    throw Object.assign(
      new Error('Job must have at least one mandatory skill before mass screening'),
      { status: 400 }
    );
  }
  if (input.files.length === 0) {
    throw Object.assign(new Error('At least one resume is required'), { status: 400 });
  }
  if (input.files.length > MASS_SCREEN_MAX_FILES) {
    throw Object.assign(new Error(`At most ${MASS_SCREEN_MAX_FILES} resumes allowed`), {
      status: 400,
    });
  }

  const batchId = randomUUID();
  const slots: MassScreenSlot[] = input.files.map(({ slot, file }) => ({
    slot,
    status: 'queued' as const,
    filename: file.originalname,
    original_filename: file.originalname,
    mime_type: file.mimetype,
    file_size_bytes: file.size,
    ai_status: 'pending' as const,
  }));

  await pool.query(
    `INSERT INTO mass_screen_batches (id, tenant_id, job_id, created_by, status, slots)
     VALUES ($1, $2, $3, $4, 'processing', $5::jsonb)`,
    [batchId, input.tenantId, input.jobId, input.userId, JSON.stringify(slots)]
  );

  const batch: MassScreenBatch = {
    id: batchId,
    tenant_id: input.tenantId,
    job_id: input.jobId,
    created_by: input.userId,
    status: 'processing',
    slots,
  };

  // Fire-and-forget progressive processing.
  void processBatchInBackground(batchId, input.tenantId, job, input.files);

  return batch;
}

async function processBatchInBackground(
  batchId: string,
  tenantId: number,
  job: JobScreenContext,
  files: Array<{ slot: number; file: Express.Multer.File }>
): Promise<void> {
  try {
    const batch = await getMassScreenBatch(tenantId, batchId);
    if (!batch) return;

    const slotMap = new Map(batch.slots.map((s) => [s.slot, s]));

    await runPool(files, PARSE_CONCURRENCY, async ({ slot, file }) => {
      const current = slotMap.get(slot);
      if (!current) return;
      slotMap.set(slot, { ...current, status: 'parsing' });
      await saveBatchSlotsSafe(
        batchId,
        tenantId,
        () => [...slotMap.values()],
        'processing'
      );

      const scored = await withGlobalParseSlot(() =>
        processSlot(tenantId, job, file, current)
      );
      slotMap.set(slot, scored);
      await saveBatchSlotsSafe(batchId, tenantId, () => [...slotMap.values()]);
    });

    const afterParse = [...slotMap.values()];
    const toEnrich = afterParse.filter(
      (s) => s.status === 'scored' && s.ai_status === 'pending' && !s.experience_rejected
    );

    await runPool(toEnrich, AI_CONCURRENCY, async (slot) => {
      const enriched = await withGlobalAiSlot(() => enrichSlotWithAi(job, slot));
      slotMap.set(slot.slot, enriched);
      await saveBatchSlotsSafe(batchId, tenantId, () => [...slotMap.values()]);
    });

    // Mark any remaining pending AI as skipped (e.g. empty queue race).
    for (const s of slotMap.values()) {
      if (s.ai_status === 'pending') {
        slotMap.set(s.slot, { ...s, ai_status: 'skipped' });
      }
    }

    const finalSlots = [...slotMap.values()].sort((a, b) => a.slot - b.slot);
    await saveBatchSlotsSafe(
      batchId,
      tenantId,
      () => finalSlots,
      recomputeBatchStatus(finalSlots)
    );
  } catch (err) {
    console.warn('Mass screen batch processing failed:', (err as Error).message);
  }
}

export interface SlotDecision {
  slot: number;
  decision: 'shortlisted' | 'rejected';
  remarks?: string;
}

export async function applyMassScreenDecisions(input: {
  tenantId: number;
  batchId: string;
  userId: number;
  decisions: SlotDecision[];
}): Promise<MassScreenBatch> {
  const batch = await getMassScreenBatch(input.tenantId, input.batchId);
  if (!batch) throw Object.assign(new Error('Batch not found or expired'), { status: 404 });
  if (batch.status === 'completed') {
    throw Object.assign(new Error('Batch already completed'), { status: 400 });
  }

  const job = await loadJob(input.tenantId, batch.job_id);
  if (!job) throw Object.assign(new Error('Job not found'), { status: 404 });

  const slots = [...batch.slots];
  const bySlot = new Map(slots.map((s, i) => [s.slot, i]));

  for (const decision of input.decisions) {
    const idx = bySlot.get(decision.slot);
    if (idx == null) {
      throw Object.assign(new Error(`Unknown slot ${decision.slot}`), { status: 400 });
    }
    const slot = slots[idx];
    if (slot.status === 'decided') continue;
    if (slot.status === 'error' || slot.status === 'skipped') {
      throw Object.assign(new Error(`Slot ${decision.slot} cannot be decided (${slot.status})`), {
        status: 400,
      });
    }
    if (slot.status !== 'scored') {
      throw Object.assign(new Error(`Slot ${decision.slot} is still processing`), { status: 400 });
    }
    if (!slot.parsed_profile) {
      throw Object.assign(new Error(`Slot ${decision.slot} has no parsed profile`), { status: 400 });
    }

    if (decision.decision === 'shortlisted') {
      // The experience gate is advisory: recruiters may override it after reviewing the resume.
    } else if (decision.decision === 'rejected') {
      if (!decision.remarks?.trim()) {
        throw Object.assign(new Error(`Slot ${decision.slot}: Reject requires remarks`), {
          status: 400,
        });
      }
    } else {
      throw Object.assign(new Error(`Invalid decision for slot ${decision.slot}`), { status: 400 });
    }

    const candidateId = await persistSlotAsCandidate({
      tenantId: input.tenantId,
      userId: input.userId,
      jobId: batch.job_id,
      slot,
      decision: decision.decision,
      remarks: decision.remarks?.trim(),
    });

    slots[idx] = {
      ...slot,
      status: 'decided',
      decision: decision.decision,
      remarks: decision.remarks?.trim(),
      candidate_id: candidateId,
      resume_excerpt: undefined,
    };
  }

  const status = recomputeBatchStatus(slots);
  await saveBatchSlots(input.batchId, input.tenantId, slots, status);

  return {
    ...batch,
    status,
    slots,
  };
}

async function persistSlotAsCandidate(input: {
  tenantId: number;
  userId: number;
  jobId: number;
  slot: MassScreenSlot;
  decision: 'shortlisted' | 'rejected';
  remarks?: string;
}): Promise<number> {
  const profile = input.slot.parsed_profile!;
  const skills = mergeSkills(profile);
  const stage = input.decision === 'shortlisted' ? 'screening' : 'rejected';
  const eligibilityScore = input.slot.eligibility_score ?? 0;
  const notesParts = [
    profile.professional_summary || '',
    input.decision === 'rejected' && input.remarks ? `Rejection remarks: ${input.remarks}` : '',
    input.slot.ai_summary ? `AI summary: ${input.slot.ai_summary}` : '',
  ].filter(Boolean);

  const { rows } = await pool.query(
    `INSERT INTO candidates (
      name, email, phone, skills, experience_years, ai_score, job_id, recruiter_id, notes,
      salary_expectation, tenant_id, stage, source, parsed_profile, linkedin, github, portfolio,
      current_company, current_location, preferred_location, notice_period, current_salary,
      professional_summary, education, experience, projects, certifications, languages,
      technical_skills, soft_skills, ats_score, ats_details
    ) VALUES (
      $1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10, $11, $12, 'resume', $13::jsonb,
      $14, $15, $16, $17, $18, $19, $20, $21, $22,
      $23::jsonb, $24::jsonb, $25::jsonb, $26::jsonb, $27::jsonb, $28::jsonb, $29::jsonb,
      $30, $31::jsonb
    ) RETURNING id`,
    [
      profile.name || input.slot.filename || 'Unknown',
      profile.email || null,
      profile.phone || null,
      JSON.stringify(skills),
      profile.total_experience_years || 0,
      eligibilityScore,
      input.jobId,
      input.userId,
      notesParts.join('\n\n') || null,
      profile.expected_salary || null,
      input.tenantId,
      stage,
      JSON.stringify(profile),
      profile.linkedin || null,
      profile.github || null,
      profile.portfolio || null,
      profile.current_company || null,
      profile.current_location || null,
      profile.preferred_location || null,
      profile.notice_period || null,
      profile.current_salary || null,
      profile.professional_summary || null,
      JSON.stringify(profile.education || []),
      JSON.stringify(profile.experience || []),
      JSON.stringify(profile.projects || []),
      JSON.stringify(profile.certifications || []),
      JSON.stringify(profile.languages || []),
      JSON.stringify(profile.technical_skills || []),
      JSON.stringify(profile.soft_skills || []),
      input.slot.ats_score ?? null,
      JSON.stringify({
        ats: input.slot.ats || null,
        eligibility: input.slot.eligibility || null,
        mass_screen: {
          decision: input.decision,
          remarks: input.remarks || null,
          ai_summary: input.slot.ai_summary || null,
        },
      }),
    ]
  );

  const candidateId = rows[0].id as number;

  if (input.slot.pending_resume_id && input.slot.pending_ext) {
    try {
      const finalPath = await finalizePendingResume(
        input.tenantId,
        input.slot.pending_resume_id,
        candidateId,
        input.slot.pending_ext
      );
      const resumeMeta = buildResumeMeta({
        storage_path: finalPath,
        original_filename: input.slot.original_filename || 'resume',
        mime_type: input.slot.mime_type || 'application/pdf',
        file_size_bytes: input.slot.file_size_bytes || 0,
        ai_confidence: Number(profile.confidence) || 0,
      });
      await pool.query(
        'UPDATE candidates SET resume_meta = $1::jsonb WHERE id = $2 AND tenant_id = $3',
        [JSON.stringify(resumeMeta), candidateId, input.tenantId]
      );
    } catch (err) {
      console.warn('Mass screen finalize resume failed:', (err as Error).message);
    }
  }

  await syncPrimaryApplication(input.tenantId, {
    id: candidateId,
    job_id: input.jobId,
    stage,
    ai_score: eligibilityScore,
    recruiter_id: input.userId,
    source: 'resume',
  });

  const activityDesc =
    input.decision === 'shortlisted'
      ? `Mass screen: Shortlisted (eligibility ${eligibilityScore}/10)`
      : input.slot.experience_rejected
        ? `Mass screen: Rejected — ${input.remarks || 'insufficient experience'}`
        : `Mass screen: Rejected (eligibility ${eligibilityScore}/10) — ${input.remarks}`;

  await pool.query(
    'INSERT INTO activities (type, description, user_id, candidate_id, tenant_id) VALUES ($1, $2, $3, $4, $5)',
    ['screening', activityDesc.slice(0, 500), input.userId, candidateId, input.tenantId]
  );

  return candidateId;
}
