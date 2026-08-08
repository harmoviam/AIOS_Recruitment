import type { Request } from 'express';
import { pool } from '../../db.js';
import { assertJobInTenant } from '../../middleware/tenant.js';
import {
  emptyJobIntelligence,
  parseJobIntelligence,
  type JobIntelligence,
} from '../../dto/aiSourcing/jobIntelligence.js';
import {
  emptyCriteria,
  parseCriteria,
  type CandidateSearchCriteria,
} from '../../dto/aiSourcing/criteria.js';
import {
  JD_ANALYSIS_PROMPT_VERSION,
  JD_ANALYSIS_SYSTEM,
  jdAnalysisUserPrompt,
} from '../../prompts/ai-sourcing/jd-analysis.js';
import { getDefaultLlmProvider, type LLMProvider } from './llmProvider.js';
import { skillOntologyService } from './skillOntologyService.js';
import { normalizeSkill } from '../skillMatch.js';

type JobRow = {
  id: number;
  title: string;
  description: string | null;
  required_skills: unknown;
  preferred_skills: unknown;
  industry: string | null;
  city: string | null;
  location: string | null;
  min_experience: number | null;
  max_experience: number | null;
  salary: string | null;
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(String).map((s) => s.trim()).filter(Boolean);
}

function heuristicFromJob(job: JobRow): JobIntelligence {
  const intel = emptyJobIntelligence();
  const desc = `${job.title || ''}\n${job.description || ''}`.toLowerCase();

  intel.role = job.title || null;
  intel.roles = job.title ? [job.title] : [];
  intel.requiredSkills = asStringArray(job.required_skills);
  intel.preferredSkills = asStringArray(job.preferred_skills);
  intel.industries = job.industry ? [job.industry] : [];
  intel.minExperienceYears = job.min_experience != null ? Number(job.min_experience) : null;
  intel.maxExperienceYears = job.max_experience != null ? Number(job.max_experience) : null;
  intel.location = job.city || job.location || null;
  intel.salaryBand = job.salary || null;
  intel.summary = (job.description || '').slice(0, 400) || null;

  if (/\b(senior|sr\.?)\b/i.test(desc)) intel.seniority = 'senior';
  else if (/\b(lead|principal|staff)\b/i.test(desc)) intel.seniority = 'lead';
  else if (/\b(junior|jr\.?|fresher)\b/i.test(desc)) intel.seniority = 'junior';

  const notice = desc.match(/notice\s+period[^0-9]{0,20}(\d+)\s*days?/);
  if (notice) intel.noticePeriodMaxDays = Number(notice[1]);

  const salary = desc.match(/(\d+(?:\.\d+)?)\s*(?:lpa|lakh)/);
  if (salary) intel.maxSalaryLpa = Number(salary[1]);

  const conf: Record<string, number> = {};
  if (intel.role) conf.role = 0.9;
  if (intel.requiredSkills.length) conf.requiredSkills = 0.85;
  if (intel.location) conf.location = 0.8;
  if (intel.minExperienceYears != null) conf.minExperienceYears = 0.85;
  if (intel.industries.length) conf.industries = 0.8;
  intel.fieldConfidence = conf;
  return intel;
}

export function intelligenceToCriteria(intel: JobIntelligence): CandidateSearchCriteria {
  const skills = [...(intel.requiredSkills || [])];
  const preferred = [...(intel.preferredSkills || [])];
  const keywords = [
    ...(intel.technicalCompetencies || []),
    ...(intel.domainExperience || []),
  ].slice(0, 20);

  return parseCriteria({
    ...emptyCriteria(),
    skills,
    preferredSkills: preferred,
    keywords,
    roles: intel.roles?.length ? intel.roles : intel.role ? [intel.role] : [],
    jobTitle: intel.role || null,
    location: intel.location || null,
    industries: intel.industries || [],
    seniority: intel.seniority || null,
    minExperienceYears: intel.minExperienceYears ?? null,
    maxExperienceYears: intel.maxExperienceYears ?? null,
    noticePeriodMaxDays: intel.noticePeriodMaxDays ?? null,
    maxSalaryLpa: intel.maxSalaryLpa ?? null,
  });
}

export class JDIntelligenceService {
  constructor(private readonly llm: LLMProvider = getDefaultLlmProvider()) {}

  private async loadJob(tenantId: number, jobId: number): Promise<JobRow | null> {
    if (!(await assertJobInTenant(jobId, tenantId))) return null;
    const { rows } = await pool.query(
      `SELECT id, title, description, required_skills, preferred_skills, industry,
              city, location, min_experience, max_experience, salary
       FROM jobs WHERE id = $1 AND tenant_id = $2`,
      [jobId, tenantId]
    );
    return (rows[0] as JobRow) || null;
  }

  async analyze(req: Request, jobId: number): Promise<{
    jobId: number;
    intelligence: JobIntelligence;
    criteria: CandidateSearchCriteria;
    parserMode: string;
    promptVersion: string;
    updatedAt: string;
  }> {
    const tenantId = req.tenant!.id;
    const job = await this.loadJob(tenantId, jobId);
    if (!job) {
      throw Object.assign(new Error('Job not found'), { status: 404 });
    }

    let intelligence = heuristicFromJob(job);
    let parserMode: 'heuristic' | 'hybrid' = 'heuristic';

    if (this.llm.isAvailable() && typeof this.llm.completeJson === 'function') {
      const llmRaw = await this.llm.completeJson!({
        system: JD_ANALYSIS_SYSTEM,
        user: jdAnalysisUserPrompt({
          title: job.title,
          description: job.description || '',
          requiredSkills: job.required_skills,
          preferredSkills: job.preferred_skills,
          industry: job.industry,
          location: job.city || job.location,
          minExperience: job.min_experience,
          maxExperience: job.max_experience,
          salary: job.salary,
        }),
      });
      if (llmRaw) {
        try {
          const llmIntel = parseJobIntelligence({
            ...emptyJobIntelligence(),
            ...llmRaw,
            fieldConfidence:
              (llmRaw.fieldConfidence as Record<string, number>) || intelligence.fieldConfidence,
          });
          // Prefer LLM lists when non-empty; keep job structured fields as fallback.
          intelligence = parseJobIntelligence({
            ...intelligence,
            ...llmIntel,
            role: llmIntel.role || intelligence.role,
            requiredSkills: llmIntel.requiredSkills.length
              ? llmIntel.requiredSkills
              : intelligence.requiredSkills,
            preferredSkills: llmIntel.preferredSkills.length
              ? llmIntel.preferredSkills
              : intelligence.preferredSkills,
            industries: llmIntel.industries.length ? llmIntel.industries : intelligence.industries,
            location: llmIntel.location || intelligence.location,
            minExperienceYears: llmIntel.minExperienceYears ?? intelligence.minExperienceYears,
            maxExperienceYears: llmIntel.maxExperienceYears ?? intelligence.maxExperienceYears,
          });
          parserMode = 'hybrid';
        } catch {
          // keep heuristic
        }
      }
    }

    intelligence.requiredSkills = skillOntologyService.normalizeMany(intelligence.requiredSkills);
    intelligence.preferredSkills = skillOntologyService.normalizeMany(intelligence.preferredSkills);

    const { rows } = await pool.query(
      `INSERT INTO ai_job_intelligence
         (tenant_id, job_id, intelligence_json, field_confidence, parser_mode, prompt_version, updated_at)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, NOW())
       ON CONFLICT (tenant_id, job_id) DO UPDATE SET
         intelligence_json = EXCLUDED.intelligence_json,
         field_confidence = EXCLUDED.field_confidence,
         parser_mode = EXCLUDED.parser_mode,
         prompt_version = EXCLUDED.prompt_version,
         updated_at = NOW()
       RETURNING updated_at`,
      [
        tenantId,
        jobId,
        JSON.stringify(intelligence),
        JSON.stringify(intelligence.fieldConfidence || {}),
        parserMode,
        JD_ANALYSIS_PROMPT_VERSION,
      ]
    );

    return {
      jobId,
      intelligence,
      criteria: intelligenceToCriteria(intelligence),
      parserMode,
      promptVersion: JD_ANALYSIS_PROMPT_VERSION,
      updatedAt: new Date(rows[0].updated_at as string).toISOString(),
    };
  }

  async get(req: Request, jobId: number) {
    const tenantId = req.tenant!.id;
    if (!(await assertJobInTenant(jobId, tenantId))) {
      throw Object.assign(new Error('Job not found'), { status: 404 });
    }
    const { rows } = await pool.query(
      `SELECT intelligence_json, field_confidence, parser_mode, prompt_version, updated_at
       FROM ai_job_intelligence WHERE tenant_id = $1 AND job_id = $2`,
      [tenantId, jobId]
    );
    if (!rows[0]) return null;
    const intelligence = parseJobIntelligence(rows[0].intelligence_json);
    return {
      jobId,
      intelligence,
      criteria: intelligenceToCriteria(intelligence),
      parserMode: rows[0].parser_mode as string,
      promptVersion: rows[0].prompt_version as string,
      updatedAt: new Date(rows[0].updated_at as string).toISOString(),
    };
  }
}

export const jdIntelligenceService = new JDIntelligenceService();

/** Exported for tests */
export function normalizeSkillList(skills: string[]): string[] {
  return Array.from(new Set(skills.map(normalizeSkill).filter(Boolean)));
}
