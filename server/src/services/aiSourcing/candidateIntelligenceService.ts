import type { Request } from 'express';
import { pool } from '../../db.js';
import { assertCandidateAccess } from '../accessScope.js';
import {
  emptyCandidateIntelligence,
  parseCandidateIntelligence,
  type CandidateIntelligence,
} from '../../dto/aiSourcing/candidateIntelligence.js';
import {
  CANDIDATE_ANALYSIS_PROMPT_VERSION,
  CANDIDATE_ANALYSIS_SYSTEM,
  candidateAnalysisUserPrompt,
} from '../../prompts/ai-sourcing/candidate-analysis.js';
import { getDefaultLlmProvider, type LLMProvider } from './llmProvider.js';
import { skillOntologyService } from './skillOntologyService.js';

type CandidateRow = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  skills: unknown;
  technical_skills: unknown;
  soft_skills: unknown;
  experience_years: number | null;
  current_location: string | null;
  preferred_location: string | null;
  current_company: string | null;
  notice_period: string | null;
  salary_expectation: string | null;
  professional_summary: string | null;
  certifications: unknown;
  education: unknown;
  resume_text: string | null;
  parsed_profile: unknown;
  updated_at: string | Date;
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(String).map((s) => s.trim()).filter(Boolean);
}

function parseNoticeDays(value: string | null): number | null {
  if (!value) return null;
  const m = value.match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

function parseSalaryLpa(value: string | null): number | null {
  if (!value) return null;
  const m = value.match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

function profileFromRow(row: CandidateRow): CandidateIntelligence {
  const parsed =
    row.parsed_profile && typeof row.parsed_profile === 'object'
      ? (row.parsed_profile as Record<string, unknown>)
      : {};

  const skills = Array.from(
    new Set([
      ...asStringArray(row.skills),
      ...asStringArray(row.technical_skills),
      ...asStringArray(parsed.skills),
      ...asStringArray(parsed.technical_skills),
    ])
  );

  const education = asStringArray(row.education).length
    ? asStringArray(row.education).map(String)
    : asStringArray(parsed.education).map((e) =>
        typeof e === 'object' && e && 'degree' in (e as object)
          ? String((e as { degree?: string }).degree || e)
          : String(e)
      );

  const missing: string[] = [];
  if (!row.email && !parsed.email) missing.push('email');
  if (!row.phone && !parsed.phone) missing.push('phone');
  if (!row.current_location && !parsed.current_location) missing.push('location');
  if (!skills.length) missing.push('skills');
  if (row.notice_period == null && parsed.notice_period == null) missing.push('notice_period');
  if (row.salary_expectation == null && parsed.expected_salary == null) missing.push('expected_salary');

  const intel = emptyCandidateIntelligence();
  intel.name = row.name || (parsed.name as string) || null;
  intel.email = row.email || (parsed.email as string) || null;
  intel.phone = row.phone || (parsed.phone as string) || null;
  intel.location = row.current_location || (parsed.current_location as string) || null;
  intel.currentCompany =
    row.current_company || (parsed.current_company as string) || null;
  intel.previousCompanies = asStringArray(parsed.previous_companies);
  intel.totalExperienceYears =
    row.experience_years != null
      ? Number(row.experience_years)
      : typeof parsed.total_experience_years === 'number'
        ? parsed.total_experience_years
        : null;
  intel.skills = skills;
  intel.education = education.slice(0, 15);
  intel.certifications = asStringArray(row.certifications).length
    ? asStringArray(row.certifications)
    : asStringArray(parsed.certifications);
  intel.expectedSalary = row.salary_expectation || (parsed.expected_salary as string) || null;
  intel.expectedSalaryLpa = parseSalaryLpa(intel.expectedSalary);
  intel.noticePeriodDays =
    parseNoticeDays(row.notice_period) ?? parseNoticeDays((parsed.notice_period as string) || null);
  intel.summary =
    row.professional_summary || (parsed.professional_summary as string) || null;
  intel.profileFreshness = row.updated_at
    ? new Date(row.updated_at).toISOString().slice(0, 10)
    : null;
  intel.resumeFreshness = row.resume_text ? 'present' : 'missing';
  intel.missingFields = missing;
  intel.leadershipExperience = /\b(led|managed|team lead|leadership)\b/i.test(
    `${row.resume_text || ''} ${intel.summary || ''}`
  );
  intel.fieldConfidence = {
    name: intel.name ? 0.95 : 0,
    skills: skills.length ? 0.8 : 0,
    location: intel.location ? 0.75 : 0,
    totalExperienceYears: intel.totalExperienceYears != null ? 0.85 : 0,
  };
  return intel;
}

/**
 * Builds / refreshes candidate_ai_profiles.
 * Never mutates candidates.resume_text or candidates.parsed_profile.
 */
export class CandidateIntelligenceService {
  constructor(private readonly llm: LLMProvider = getDefaultLlmProvider()) {}

  async analyze(req: Request, candidateId: number): Promise<{
    candidateId: number;
    profile: CandidateIntelligence;
    parserMode: string;
    promptVersion: string;
    updatedAt: string;
  }> {
    const accessible = await assertCandidateAccess(req, candidateId);
    if (!accessible) {
      throw Object.assign(new Error('Candidate not found'), { status: 404 });
    }

    const { rows } = await pool.query(
      `SELECT id, name, email, phone, skills, technical_skills, soft_skills,
              experience_years, current_location, preferred_location, current_company,
              notice_period, salary_expectation, professional_summary, certifications,
              education, resume_text, parsed_profile, updated_at
       FROM candidates WHERE id = $1 AND tenant_id = $2`,
      [candidateId, req.tenant!.id]
    );
    const row = rows[0] as CandidateRow | undefined;
    if (!row) {
      throw Object.assign(new Error('Candidate not found'), { status: 404 });
    }

    // Snapshot raw resume presence — we never write back to resume_text.
    const hasRawResume = Boolean(row.resume_text);

    let profile = profileFromRow(row);
    let parserMode: 'heuristic' | 'hybrid' = 'heuristic';

    if (this.llm.isAvailable() && typeof this.llm.completeJson === 'function' && (row.resume_text || row.parsed_profile)) {
      const llmRaw = await this.llm.completeJson!({
        system: CANDIDATE_ANALYSIS_SYSTEM,
        user: candidateAnalysisUserPrompt({
          name: row.name,
          resumeText: row.resume_text,
          parsedProfile: row.parsed_profile,
          skills: row.skills,
          experienceYears: row.experience_years,
          location: row.current_location,
        }),
      });
      if (llmRaw) {
        try {
          const llmProfile = parseCandidateIntelligence({
            ...emptyCandidateIntelligence(),
            ...llmRaw,
          });
          // Candidate-supplied contact fields win over LLM guesses.
          profile = parseCandidateIntelligence({
            ...profile,
            ...llmProfile,
            name: row.name || llmProfile.name,
            email: row.email || llmProfile.email,
            phone: row.phone || llmProfile.phone,
            skills: llmProfile.skills.length ? llmProfile.skills : profile.skills,
            missingFields: llmProfile.missingFields.length
              ? llmProfile.missingFields
              : profile.missingFields,
          });
          parserMode = 'hybrid';
        } catch {
          // keep heuristic
        }
      }
    }

    profile.normalizedSkills = skillOntologyService.normalizeMany(profile.skills);
    profile.resumeFreshness = hasRawResume ? 'present' : 'missing';

    const { rows: saved } = await pool.query(
      `INSERT INTO candidate_ai_profiles
         (tenant_id, candidate_id, profile_json, field_confidence, parser_mode, prompt_version, updated_at)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, NOW())
       ON CONFLICT (tenant_id, candidate_id) DO UPDATE SET
         profile_json = EXCLUDED.profile_json,
         field_confidence = EXCLUDED.field_confidence,
         parser_mode = EXCLUDED.parser_mode,
         prompt_version = EXCLUDED.prompt_version,
         updated_at = NOW()
       RETURNING updated_at`,
      [
        req.tenant!.id,
        candidateId,
        JSON.stringify(profile),
        JSON.stringify(profile.fieldConfidence || {}),
        parserMode,
        CANDIDATE_ANALYSIS_PROMPT_VERSION,
      ]
    );

    return {
      candidateId,
      profile,
      parserMode,
      promptVersion: CANDIDATE_ANALYSIS_PROMPT_VERSION,
      updatedAt: new Date(saved[0].updated_at as string).toISOString(),
    };
  }

  async get(req: Request, candidateId: number) {
    const accessible = await assertCandidateAccess(req, candidateId);
    if (!accessible) {
      throw Object.assign(new Error('Candidate not found'), { status: 404 });
    }
    const { rows } = await pool.query(
      `SELECT profile_json, field_confidence, parser_mode, prompt_version, updated_at
       FROM candidate_ai_profiles WHERE tenant_id = $1 AND candidate_id = $2`,
      [req.tenant!.id, candidateId]
    );
    if (!rows[0]) return null;
    return {
      candidateId,
      profile: parseCandidateIntelligence(rows[0].profile_json),
      parserMode: rows[0].parser_mode as string,
      promptVersion: rows[0].prompt_version as string,
      updatedAt: new Date(rows[0].updated_at as string).toISOString(),
    };
  }
}

export const candidateIntelligenceService = new CandidateIntelligenceService();
