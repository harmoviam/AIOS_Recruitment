import { pool } from '../../../db.js';
import type { PeopleSearchFilters, PeopleSearchResult } from '../../../types/sourcing.js';
import { buildPersonSearchQuery, clampSize } from './queryBuilder.js';
import { mapPdlPerson, pdlMode, pdlPersonSearch } from './pdlClient.js';
import { samplePeople } from './sampleProfiles.js';

export interface PeopleSearchContext {
  tenantId: number;
  userId?: number;
}

const PROVIDER_UNAVAILABLE =
  'People search provider is unavailable right now. Please try again in a few minutes.';

export async function searchPeople(
  filters: PeopleSearchFilters,
  promptText: string | null,
  context: PeopleSearchContext
): Promise<PeopleSearchResult> {
  const size = clampSize(filters.size);
  const mode = pdlMode();

  let result: PeopleSearchResult;
  if (mode === 'simulated') {
    result = {
      provider: 'SIMULATED',
      mode,
      filters,
      profiles: samplePeople(filters, size),
      total: null,
      creditsUsed: 0,
    };
  } else {
    const query = buildPersonSearchQuery(filters);
    const response = await pdlPersonSearch(query, size);
    if (!response) {
      result = {
        provider: 'PDL',
        mode,
        filters,
        profiles: [],
        total: null,
        creditsUsed: 0,
        error: PROVIDER_UNAVAILABLE,
      };
    } else {
      const profiles = response.people.map(mapPdlPerson);
      result = {
        provider: 'PDL',
        mode,
        filters,
        profiles,
        total: response.total,
        creditsUsed: profiles.length,
      };
    }
  }

  // Failed live calls are persisted too (result_count 0) for observability.
  try {
    const { rows } = await pool.query(
      `INSERT INTO people_search_run
         (tenant_id, recruiter_user_id, prompt_text, filters_json, result_json,
          result_count, provider, credits_used, created_by)
       VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8,$9) RETURNING id`,
      [
        context.tenantId,
        context.userId ?? null,
        promptText,
        JSON.stringify(filters),
        JSON.stringify(result),
        result.profiles.length,
        result.provider,
        result.creditsUsed,
        context.userId ? String(context.userId) : null,
      ]
    );
    result.runId = String(rows[0].id);
  } catch (err) {
    console.warn('people_search_run insert failed:', (err as Error).message);
  }

  return result;
}
