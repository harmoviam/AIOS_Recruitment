import type { Request } from 'express';
import { pool } from '../../db.js';
import {
  emptyCriteria,
  parseCriteria,
  type CandidateSearchCriteria,
  type FieldConfidence,
} from '../../dto/aiSourcing/criteria.js';
import {
  candidateSearchService,
  type AiSourcingCandidateHit,
} from './candidateSearchService.js';
import {
  createRequirementParserService,
  type ParseRequirementsResult,
  type RequirementParserService,
} from './requirementParserService.js';

export type SavedSearchResponse = {
  id: string;
  query: string;
  criteria: CandidateSearchCriteria;
  fieldConfidence: FieldConfidence;
  parserMode: string;
  resultCount: number;
  results: AiSourcingCandidateHit[];
  limit: number;
  offset: number;
  createdAt: string;
};

export type RecentSearchItem = {
  id: string;
  query: string;
  resultCount: number;
  parserMode: string;
  criteria: CandidateSearchCriteria;
  createdAt: string;
};

/**
 * Orchestrates parse → (optional edit) → structured search → persistence.
 */
export class SearchRequirementService {
  constructor(private readonly parser: RequirementParserService = createRequirementParserService()) {}

  async parseOnly(query: string): Promise<ParseRequirementsResult> {
    return this.parser.parse(query);
  }

  async searchAndPersist(
    req: Request,
    input: {
      query: string;
      criteria?: unknown;
      limit?: number;
      offset?: number;
    }
  ): Promise<SavedSearchResponse> {
    const query = input.query.trim();
    let parsed: ParseRequirementsResult | null = null;
    let criteria: CandidateSearchCriteria;
    let fieldConfidence: FieldConfidence = {};
    let parserMode = 'heuristic';

    if (input.criteria != null) {
      criteria = parseCriteria(input.criteria);
      // Still run parser for confidence/metadata when query present
      if (query) {
        parsed = await this.parser.parse(query);
        fieldConfidence = parsed.fieldConfidence;
        parserMode = parsed.parserMode;
      }
    } else {
      parsed = await this.parser.parse(query);
      criteria = parsed.criteria;
      fieldConfidence = parsed.fieldConfidence;
      parserMode = parsed.parserMode;
    }

    const page = await candidateSearchService.search(req, criteria, {
      limit: input.limit,
      offset: input.offset,
    });

    const preview = page.results.slice(0, 25);
    const { rows } = await pool.query(
      `INSERT INTO ai_sourcing_searches
         (tenant_id, user_id, query_text, criteria_json, field_confidence, result_count, result_preview, parser_mode)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7::jsonb, $8)
       RETURNING id, created_at`,
      [
        req.tenant!.id,
        req.user!.id,
        query || JSON.stringify(criteria),
        JSON.stringify(criteria),
        JSON.stringify(fieldConfidence),
        page.resultCount,
        JSON.stringify(preview),
        parserMode,
      ]
    );

    return {
      id: rows[0].id as string,
      query: query || '',
      criteria,
      fieldConfidence,
      parserMode,
      resultCount: page.resultCount,
      results: page.results,
      limit: page.limit,
      offset: page.offset,
      createdAt: new Date(rows[0].created_at as string).toISOString(),
    };
  }

  async getById(req: Request, id: string): Promise<SavedSearchResponse | null> {
    const { rows } = await pool.query(
      `SELECT id, query_text, criteria_json, field_confidence, result_count, result_preview, parser_mode, created_at, user_id
       FROM ai_sourcing_searches
       WHERE id = $1 AND tenant_id = $2`,
      [id, req.tenant!.id]
    );
    if (!rows[0]) return null;

    const role = req.user!.role;
    if (role !== 'admin' && role !== 'super_admin' && rows[0].user_id !== req.user!.id) {
      return null;
    }

    const criteria = parseCriteria(rows[0].criteria_json ?? emptyCriteria());
    const results = (rows[0].result_preview as AiSourcingCandidateHit[]) || [];
    return {
      id: rows[0].id as string,
      query: rows[0].query_text as string,
      criteria,
      fieldConfidence: (rows[0].field_confidence as FieldConfidence) || {},
      parserMode: rows[0].parser_mode as string,
      resultCount: Number(rows[0].result_count) || 0,
      results,
      limit: results.length,
      offset: 0,
      createdAt: new Date(rows[0].created_at as string).toISOString(),
    };
  }

  async listRecent(req: Request, limit = 10): Promise<RecentSearchItem[]> {
    const lim = Math.min(Math.max(limit, 1), 50);
    const role = req.user!.role;
    const admin = role === 'admin' || role === 'super_admin';
    const { rows } = await pool.query(
      admin
        ? `SELECT id, query_text, result_count, parser_mode, criteria_json, created_at
           FROM ai_sourcing_searches
           WHERE tenant_id = $1
           ORDER BY created_at DESC
           LIMIT $2`
        : `SELECT id, query_text, result_count, parser_mode, criteria_json, created_at
           FROM ai_sourcing_searches
           WHERE tenant_id = $1 AND user_id = $2
           ORDER BY created_at DESC
           LIMIT $3`,
      admin ? [req.tenant!.id, lim] : [req.tenant!.id, req.user!.id, lim]
    );

    return rows.map((r) => ({
      id: r.id as string,
      query: r.query_text as string,
      resultCount: Number(r.result_count) || 0,
      parserMode: r.parser_mode as string,
      criteria: parseCriteria(r.criteria_json ?? {}),
      createdAt: new Date(r.created_at as string).toISOString(),
    }));
  }
}

export const searchRequirementService = new SearchRequirementService();

export const RECOMMENDED_SEARCHES = [
  {
    label: 'React mid-level in Bangalore',
    query: 'React developers in Bangalore with 3+ years',
  },
  {
    label: 'Java backend Pune',
    query: 'Java backend engineers in Pune with 5+ years experience',
  },
  {
    label: 'Voice process Mohali',
    query: 'International voice process candidates in Mohali with 1+ years',
  },
  {
    label: 'Freshers in Hyderabad',
    query: 'Fresher graduates in Hyderabad for customer support',
  },
  {
    label: 'DevOps remote',
    query: 'DevOps engineers remote with Kubernetes and AWS',
  },
];
