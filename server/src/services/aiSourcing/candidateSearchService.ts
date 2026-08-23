import type { Request } from 'express';
import { pool } from '../../db.js';
import { tenantClause } from '../../middleware/tenant.js';
import { candidateScopeSql } from '../accessScope.js';
import {
  criteriaHasSignal,
  type CandidateSearchCriteria,
} from '../../dto/aiSourcing/criteria.js';
import { skillOntologyService } from './skillOntologyService.js';

export type AiSourcingCandidateHit = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  skills: unknown;
  experienceYears: number;
  stage: string;
  location: string | null;
  jobTitle: string | null;
  aiScore: number;
  hybridScore: number;
  matchSignals: string[];
};

export type CandidateSearchPage = {
  results: AiSourcingCandidateHit[];
  resultCount: number;
  limit: number;
  offset: number;
  expandedSkills: string[];
};

/**
 * Build parameterized WHERE fragments from structured criteria.
 * Exported for unit tests.
 */
export function buildCriteriaClauses(
  criteria: CandidateSearchCriteria,
  startIndex: number,
  opts: { expandedSkills?: string[] } = {}
): { sql: string; params: unknown[]; nextIndex: number } {
  let i = startIndex;
  const params: unknown[] = [];
  let sql = '';

  if (criteria.minExperienceYears != null) {
    sql += ` AND COALESCE(c.experience_years, 0) >= $${i++}`;
    params.push(criteria.minExperienceYears);
  }
  if (criteria.maxExperienceYears != null) {
    sql += ` AND COALESCE(c.experience_years, 0) <= $${i++}`;
    params.push(criteria.maxExperienceYears);
  }
  if (criteria.location) {
    sql += ` AND (
      c.current_location ILIKE $${i}
      OR c.preferred_location ILIKE $${i}
      OR COALESCE(j.city, '') ILIKE $${i}
      OR COALESCE(j.location, '') ILIKE $${i}
    )`;
    params.push(`%${criteria.location}%`);
    i += 1;
  }
  if (criteria.stage) {
    sql += ` AND c.stage = $${i++}`;
    params.push(criteria.stage);
  }
  if (criteria.minAiScore != null) {
    sql += ` AND COALESCE(c.ai_score, 0) >= $${i++}`;
    params.push(criteria.minAiScore);
  }

  const skillTerms =
    opts.expandedSkills && opts.expandedSkills.length
      ? opts.expandedSkills
      : [...(criteria.skills || []), ...(criteria.preferredSkills || [])].map((s) =>
          s.toLowerCase()
        );

  if (skillTerms.length) {
    // Match across skills / technical_skills / soft_skills / resume text
    sql += ` AND (
      EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(COALESCE(c.skills, '[]'::jsonb)) = 'array'
               THEN c.skills ELSE '[]'::jsonb END
        ) AS s(skill)
        WHERE LOWER(s.skill) = ANY($${i}::text[])
           OR LOWER(s.skill) LIKE ANY($${i + 1}::text[])
      )
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(COALESCE(c.technical_skills, '[]'::jsonb)) = 'array'
               THEN c.technical_skills ELSE '[]'::jsonb END
        ) AS t(skill)
        WHERE LOWER(t.skill) = ANY($${i}::text[])
           OR LOWER(t.skill) LIKE ANY($${i + 1}::text[])
      )
      OR LOWER(COALESCE(c.skills::text, '')) LIKE ANY($${i + 1}::text[])
      OR LOWER(COALESCE(c.soft_skills::text, '')) LIKE ANY($${i + 1}::text[])
      OR LOWER(COALESCE(c.resume_text, '')) LIKE ANY($${i + 1}::text[])
    )`;
    const lowered = skillTerms.map((s) => s.toLowerCase());
    params.push(lowered, lowered.map((s) => `%${s}%`));
    i += 2;
  }

  if (criteria.industries && criteria.industries.length) {
    sql += ` AND (
      LOWER(COALESCE(j.industry, '')) LIKE ANY($${i}::text[])
      OR LOWER(COALESCE(c.resume_text, '')) LIKE ANY($${i}::text[])
      OR LOWER(COALESCE(c.professional_summary, '')) LIKE ANY($${i}::text[])
      OR LOWER(COALESCE(c.parsed_profile::text, '')) LIKE ANY($${i}::text[])
    )`;
    params.push(criteria.industries.map((x) => `%${x.toLowerCase()}%`));
    i += 1;
  }

  if (criteria.noticePeriodMaxDays != null) {
    // Soft filter: keep rows with unknown notice OR parseable notice <= max
    sql += ` AND (
      c.notice_period IS NULL
      OR TRIM(c.notice_period) = ''
      OR (
        SUBSTRING(c.notice_period FROM '\\d+') ~ '^[0-9]+$'
        AND CAST(SUBSTRING(c.notice_period FROM '\\d+') AS INTEGER) <= $${i}
      )
    )`;
    params.push(criteria.noticePeriodMaxDays);
    i += 1;
  }

  if (criteria.maxSalaryLpa != null) {
    sql += ` AND (
      c.salary_expectation IS NULL
      OR TRIM(c.salary_expectation) = ''
      OR (
        SUBSTRING(c.salary_expectation FROM '\\d+(?:\\.\\d+)?') ~ '^[0-9]+(\\.[0-9]+)?$'
        AND CAST(SUBSTRING(c.salary_expectation FROM '\\d+(?:\\.\\d+)?') AS NUMERIC) <= $${i}
      )
    )`;
    params.push(criteria.maxSalaryLpa);
    i += 1;
  }

  const ftsParts: string[] = [];
  if (criteria.jobTitle) ftsParts.push(criteria.jobTitle);
  if (criteria.roles?.length) ftsParts.push(...criteria.roles);
  if (criteria.keywords?.length) ftsParts.push(...criteria.keywords);
  if (criteria.seniority) ftsParts.push(criteria.seniority);
  if (ftsParts.length) {
    const q = ftsParts.join(' ');
    sql += ` AND (
      c.search_tsv @@ websearch_to_tsquery('english', $${i})
      OR c.name ILIKE $${i + 1}
      OR COALESCE(j.title, '') ILIKE $${i + 1}
      OR COALESCE(c.skills::text, '') ILIKE $${i + 1}
      OR COALESCE(c.resume_text, '') ILIKE $${i + 1}
    )`;
    params.push(q, `%${criteria.jobTitle || criteria.roles?.[0] || ftsParts[0]}%`);
    i += 2;
  }

  return { sql, params, nextIndex: i };
}

function buildMatchSignals(
  criteria: CandidateSearchCriteria,
  row: {
    skills: unknown;
    current_location: string | null;
    experience_years: number;
    resume_text?: string | null;
    job_title: string | null;
  }
): string[] {
  const signals: string[] = [];
  const hay = `${JSON.stringify(row.skills || [])} ${row.resume_text || ''}`.toLowerCase();
  for (const skill of criteria.skills || []) {
    if (hay.includes(skill.toLowerCase())) signals.push(`Skill: ${skill}`);
  }
  if (
    criteria.location &&
    row.current_location &&
    row.current_location.toLowerCase().includes(criteria.location.toLowerCase())
  ) {
    signals.push(`Location: ${row.current_location}`);
  }
  if (
    criteria.minExperienceYears != null &&
    Number(row.experience_years) >= criteria.minExperienceYears
  ) {
    signals.push(`${row.experience_years}+ years experience`);
  }
  if (
    criteria.jobTitle &&
    row.job_title &&
    row.job_title.toLowerCase().includes(criteria.jobTitle.toLowerCase().split(' ')[0])
  ) {
    signals.push(`Role: ${row.job_title}`);
  }
  return signals.slice(0, 6);
}

export class CandidateSearchService {
  async search(
    req: Request,
    criteria: CandidateSearchCriteria,
    opts: { limit?: number; offset?: number } = {}
  ): Promise<CandidateSearchPage> {
    const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
    const offset = Math.max(opts.offset ?? 0, 0);
    const tenantId = req.tenant!.id;

    const seedSkills = [...(criteria.skills || []), ...(criteria.preferredSkills || [])];
    let expandedSkills: string[] = seedSkills.map((s) => s.toLowerCase());
    try {
      expandedSkills = (await skillOntologyService.expandSkills(seedSkills)).map((s) =>
        s.toLowerCase()
      );
    } catch (err) {
      console.warn('[ai-sourcing] skill expand failed:', (err as Error).message);
    }

    const t = tenantClause(tenantId, 'c', 1);
    let sql = `
      SELECT c.id, c.name, c.email, c.phone, c.skills, c.experience_years,
             c.stage, c.current_location, c.ai_score, c.resume_text, j.title AS job_title,
             COUNT(*) OVER() AS total_count,
             CASE
               WHEN c.search_tsv @@ websearch_to_tsquery(
                 'english',
                 $${t.nextIndex}
               )
               THEN ts_rank_cd(c.search_tsv, websearch_to_tsquery('english', $${t.nextIndex}))
               ELSE 0
             END AS fts_rank
      FROM candidates c
      LEFT JOIN jobs j ON c.job_id = j.id AND j.tenant_id = c.tenant_id
      WHERE ${t.sql}
    `;
    const ftsQuery = [
      criteria.jobTitle,
      ...(criteria.roles || []),
      ...(criteria.keywords || []),
      ...(criteria.skills || []).slice(0, 8),
    ]
      .filter(Boolean)
      .join(' ')
      .trim() || 'candidate';

    const params: unknown[] = [t.param, ftsQuery];
    let i = t.nextIndex + 1;

    const scope = candidateScopeSql(req, 'c', i);
    sql += scope.sql;
    params.push(...scope.params);
    i = scope.nextIndex;

    if (criteriaHasSignal(criteria)) {
      const clauses = buildCriteriaClauses(criteria, i, { expandedSkills });
      sql += clauses.sql;
      params.push(...clauses.params);
      i = clauses.nextIndex;
    }

    // Hybrid ranking: FTS rank + existing AI score (semantic vectors deferred to Sprint 3).
    // Repeat the rank expression in ORDER BY — PG does not resolve SELECT aliases inside COALESCE().
    sql += ` ORDER BY
               (
                 CASE
                   WHEN c.search_tsv @@ websearch_to_tsquery('english', $2)
                   THEN ts_rank_cd(c.search_tsv, websearch_to_tsquery('english', $2))
                   ELSE 0
                 END * 4 + COALESCE(c.ai_score, 0)
               ) DESC,
               c.updated_at DESC
             LIMIT $${i++} OFFSET $${i++}`;
    params.push(limit, offset);

    const { rows } = await pool.query(sql, params);
    const resultCount = rows.length > 0 ? Number(rows[0].total_count) : 0;
    const results: AiSourcingCandidateHit[] = rows.map((r) => {
      const ftsRank = Number(r.fts_rank) || 0;
      const aiScore = Number(r.ai_score) || 0;
      const hybridScore = Math.min(100, Math.round(ftsRank * 40 + aiScore * 6));
      const matchSignals = buildMatchSignals(criteria, {
        skills: r.skills,
        current_location: (r.current_location as string) ?? null,
        experience_years: Number(r.experience_years) || 0,
        resume_text: (r.resume_text as string) ?? null,
        job_title: (r.job_title as string) ?? null,
      });
      return {
        id: r.id as number,
        name: r.name as string,
        email: (r.email as string) ?? null,
        phone: (r.phone as string) ?? null,
        skills: r.skills,
        experienceYears: Number(r.experience_years) || 0,
        stage: r.stage as string,
        location: (r.current_location as string) ?? null,
        jobTitle: (r.job_title as string) ?? null,
        aiScore,
        hybridScore,
        matchSignals,
      };
    });

    return { results, resultCount, limit, offset, expandedSkills };
  }
}

export const candidateSearchService = new CandidateSearchService();
