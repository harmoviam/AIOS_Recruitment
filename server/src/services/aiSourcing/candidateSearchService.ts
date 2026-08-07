import type { Request } from 'express';
import { pool } from '../../db.js';
import { tenantClause } from '../../middleware/tenant.js';
import { candidateScopeSql } from '../accessScope.js';
import {
  criteriaHasSignal,
  type CandidateSearchCriteria,
} from '../../dto/aiSourcing/criteria.js';

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
};

export type CandidateSearchPage = {
  results: AiSourcingCandidateHit[];
  resultCount: number;
  limit: number;
  offset: number;
};

/**
 * Build parameterized WHERE fragments from structured criteria.
 * Exported for unit tests.
 */
export function buildCriteriaClauses(
  criteria: CandidateSearchCriteria,
  startIndex: number
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
  if (criteria.skills && criteria.skills.length) {
    // Match skills whether stored as a JSON string array or free-text in skills::text
    sql += ` AND (
      EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(COALESCE(c.skills, '[]'::jsonb)) = 'array'
               THEN c.skills ELSE '[]'::jsonb END
        ) AS s(skill)
        WHERE LOWER(s.skill) = ANY($${i}::text[])
      )
      OR LOWER(COALESCE(c.skills::text, '')) LIKE ANY($${i + 1}::text[])
    )`;
    const lowered = criteria.skills.map((s) => s.toLowerCase());
    params.push(lowered, lowered.map((s) => `%${s}%`));
    i += 2;
  }

  const ftsParts: string[] = [];
  if (criteria.jobTitle) ftsParts.push(criteria.jobTitle);
  if (criteria.keywords?.length) ftsParts.push(...criteria.keywords);
  if (ftsParts.length) {
    const q = ftsParts.join(' ');
    sql += ` AND (
      c.search_tsv @@ websearch_to_tsquery('english', $${i})
      OR c.name ILIKE $${i + 1}
      OR COALESCE(j.title, '') ILIKE $${i + 1}
      OR COALESCE(c.skills::text, '') ILIKE $${i + 1}
    )`;
    params.push(q, `%${criteria.jobTitle || ftsParts[0]}%`);
    i += 2;
  }

  return { sql, params, nextIndex: i };
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

    const t = tenantClause(tenantId, 'c', 1);
    let sql = `
      SELECT c.id, c.name, c.email, c.phone, c.skills, c.experience_years,
             c.stage, c.current_location, c.ai_score, j.title AS job_title,
             COUNT(*) OVER() AS total_count
      FROM candidates c
      LEFT JOIN jobs j ON c.job_id = j.id AND j.tenant_id = c.tenant_id
      WHERE ${t.sql}
    `;
    const params: unknown[] = [t.param];
    let i = t.nextIndex;

    const scope = candidateScopeSql(req, 'c', i);
    sql += scope.sql;
    params.push(...scope.params);
    i = scope.nextIndex;

    if (criteriaHasSignal(criteria)) {
      const clauses = buildCriteriaClauses(criteria, i);
      sql += clauses.sql;
      params.push(...clauses.params);
      i = clauses.nextIndex;
    }

    sql += ` ORDER BY COALESCE(c.ai_score, 0) DESC, c.updated_at DESC
             LIMIT $${i++} OFFSET $${i++}`;
    params.push(limit, offset);

    const { rows } = await pool.query(sql, params);
    const resultCount = rows.length > 0 ? Number(rows[0].total_count) : 0;
    const results: AiSourcingCandidateHit[] = rows.map((r) => ({
      id: r.id as number,
      name: r.name as string,
      email: (r.email as string) ?? null,
      phone: (r.phone as string) ?? null,
      skills: r.skills,
      experienceYears: Number(r.experience_years) || 0,
      stage: r.stage as string,
      location: (r.current_location as string) ?? null,
      jobTitle: (r.job_title as string) ?? null,
      aiScore: Number(r.ai_score) || 0,
    }));

    return { results, resultCount, limit, offset };
  }
}

export const candidateSearchService = new CandidateSearchService();
