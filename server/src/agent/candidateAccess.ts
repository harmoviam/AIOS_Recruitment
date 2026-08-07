import { pool } from '../db.js';
import { assertCandidateAccess } from '../services/accessScope.js';
import type { ParsedProfile } from '../services/ai.js';
import type { AgentContext } from './context.js';

export class AgentToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentToolError';
  }
}

export interface LoadedCandidate {
  id: number;
  name: string;
  stage: string;
  job_id: number | null;
  salary_expectation: string | null;
  parsed_profile: ParsedProfile | null;
  resume_text: string | null;
  resume_meta: { storage_path?: string; mime_type?: string; original_filename?: string } | null;
  job_title: string | null;
  job_location: string | null;
}

export async function loadAccessibleCandidate(
  ctx: AgentContext,
  candidateId: number
): Promise<LoadedCandidate> {
  if (!Number.isFinite(candidateId) || candidateId <= 0) {
    throw new AgentToolError('candidate_id must be a positive number');
  }
  const ok = await assertCandidateAccess(ctx.req, candidateId);
  if (!ok) {
    throw new AgentToolError('Candidate not found or access denied');
  }

  const { rows } = await pool.query(
    `SELECT c.id, c.name, c.stage, c.job_id, c.salary_expectation,
            c.parsed_profile, c.resume_text, c.resume_meta,
            j.title AS job_title, j.location AS job_location
     FROM candidates c
     LEFT JOIN jobs j ON j.id = c.job_id AND j.tenant_id = c.tenant_id
     WHERE c.id = $1 AND c.tenant_id = $2`,
    [candidateId, ctx.tenantId]
  );
  const row = rows[0];
  if (!row) throw new AgentToolError('Candidate not found or access denied');

  return {
    id: row.id,
    name: row.name,
    stage: row.stage,
    job_id: row.job_id,
    salary_expectation: row.salary_expectation,
    parsed_profile: (row.parsed_profile as ParsedProfile | null) ?? null,
    resume_text: row.resume_text ?? null,
    resume_meta: (row.resume_meta as LoadedCandidate['resume_meta']) ?? null,
    job_title: row.job_title ?? null,
    job_location: row.job_location ?? null,
  };
}

export async function loadJobForTenant(
  tenantId: number,
  jobId: number | null | undefined
): Promise<{
  id: number;
  title: string;
  description: string | null;
  required_skills: string[];
  preferred_skills: string[];
  required_qualification: string | null;
  min_experience: number | null;
  location: string | null;
} | null> {
  const id = Number(jobId);
  if (!Number.isFinite(id) || id <= 0) return null;
  const { rows } = await pool.query(
    `SELECT id, title, description, required_skills, preferred_skills,
            required_qualification, min_experience, location
     FROM jobs WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    required_skills: Array.isArray(r.required_skills) ? r.required_skills : [],
    preferred_skills: Array.isArray(r.preferred_skills) ? r.preferred_skills : [],
    required_qualification: r.required_qualification,
    min_experience: r.min_experience,
    location: r.location,
  };
}
