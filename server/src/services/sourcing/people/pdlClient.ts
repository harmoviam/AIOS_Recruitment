import type { PersonProfile } from '../../../types/sourcing.js';

function cfg() {
  return {
    apiKey: process.env.PDL_API_KEY || '',
    baseUrl: (process.env.PDL_BASE_URL || 'https://api.peopledatalabs.com').replace(/\/$/, ''),
    enabled: process.env.PDL_ENABLED !== 'false',
    timeoutMs: Number(process.env.PDL_TIMEOUT_MS) || 15_000,
  };
}

export function pdlMode(): 'live' | 'simulated' {
  const c = cfg();
  return c.enabled && c.apiKey ? 'live' : 'simulated';
}

/**
 * Minimal slice of a PDL person record — only the fields we map.
 * Fields are typed unknown: PDL substitutes booleans for redacted string
 * fields on lower plans, so every value is checked before use.
 */
export interface PdlPersonRaw {
  id?: unknown;
  full_name?: unknown;
  job_title?: unknown;
  job_company_name?: unknown;
  location_name?: unknown;
  skills?: unknown;
  inferred_years_experience?: unknown;
  linkedin_url?: unknown;
}

interface PdlSearchResponse {
  status?: number;
  data?: PdlPersonRaw[];
  total?: number;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export function mapPdlPerson(raw: PdlPersonRaw): PersonProfile {
  const id = str(raw.id);
  const fullName = str(raw.full_name);
  const jobTitle = str(raw.job_title);
  const company = str(raw.job_company_name);
  const location = str(raw.location_name);
  const linkedinRaw = str(raw.linkedin_url);
  const linkedin = linkedinRaw
    ? linkedinRaw.startsWith('http')
      ? linkedinRaw
      : `https://${linkedinRaw}`
    : null;
  return {
    id: id || `pdl-${Math.random().toString(36).slice(2, 10)}`,
    fullName: fullName ? titleCase(fullName) : 'Unknown',
    jobTitle: jobTitle ? titleCase(jobTitle) : null,
    company: company ? titleCase(company) : null,
    location: location ? titleCase(location) : null,
    skills: Array.isArray(raw.skills)
      ? raw.skills.filter((s): s is string => typeof s === 'string' && !!s).slice(0, 20)
      : [],
    experienceYears:
      typeof raw.inferred_years_experience === 'number' ? raw.inferred_years_experience : null,
    linkedinUrl: linkedin,
  };
}

/**
 * POST /v5/person/search. Fail-soft: returns null on transport/auth errors so
 * callers can degrade gracefully. PDL signals "no matches" as HTTP 404 — that
 * is a valid empty result, not an error.
 */
export async function pdlPersonSearch(
  query: object,
  size: number
): Promise<{ people: PdlPersonRaw[]; total: number } | null> {
  const c = cfg();
  try {
    const res = await fetch(`${c.baseUrl}/v5/person/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': c.apiKey,
      },
      body: JSON.stringify({ size, query }),
      signal: AbortSignal.timeout(c.timeoutMs),
    });

    if (res.status === 404) {
      return { people: [], total: 0 };
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn(`PDL person search failed (${res.status}): ${body.slice(0, 300)}`);
      return null;
    }

    const payload = (await res.json()) as PdlSearchResponse;
    return {
      people: Array.isArray(payload.data) ? payload.data : [],
      total: typeof payload.total === 'number' ? payload.total : 0,
    };
  } catch (err) {
    console.warn('PDL person search error:', (err as Error).message);
    return null;
  }
}
