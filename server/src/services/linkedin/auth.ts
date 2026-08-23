/**
 * LinkedIn 2-legged OAuth (client credentials) with in-memory token cache.
 * Required for Simple Job Postings / Talent partner APIs.
 */

export interface LinkedInAuthConfig {
  clientId: string;
  clientSecret: string;
  enabled: boolean;
  timeoutMs: number;
  apiVersion: string;
  companyUrn: string;
  baseApiUrl: string;
  tokenUrl: string;
}

let cachedToken: { accessToken: string; expiresAtMs: number } | null = null;

export function linkedInConfig(): LinkedInAuthConfig {
  return {
    clientId: process.env.LINKEDIN_CLIENT_ID || '',
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET || '',
    enabled: process.env.LINKEDIN_JOB_POSTING_ENABLED === 'true',
    timeoutMs: Number(process.env.LINKEDIN_TIMEOUT_MS) || 15_000,
    apiVersion: process.env.LINKEDIN_API_VERSION || '202603',
    companyUrn: process.env.LINKEDIN_COMPANY_URN || '',
    baseApiUrl: (process.env.LINKEDIN_API_BASE_URL || 'https://api.linkedin.com').replace(/\/$/, ''),
    tokenUrl: process.env.LINKEDIN_TOKEN_URL || 'https://www.linkedin.com/oauth/v2/accessToken',
  };
}

/** True when env is configured for live SJP calls. */
export function linkedInJobPostingConfigured(): boolean {
  const c = linkedInConfig();
  return Boolean(c.enabled && c.clientId && c.clientSecret && c.companyUrn);
}

export function clearLinkedInTokenCache(): void {
  cachedToken = null;
}

export async function getLinkedInAccessToken(
  fetchImpl: typeof fetch = fetch
): Promise<{ accessToken: string; expiresIn: number }> {
  const c = linkedInConfig();
  if (!c.clientId || !c.clientSecret) {
    throw new Error('LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET are required');
  }

  const now = Date.now();
  // Refresh 60s before expiry.
  if (cachedToken && cachedToken.expiresAtMs > now + 60_000) {
    return {
      accessToken: cachedToken.accessToken,
      expiresIn: Math.floor((cachedToken.expiresAtMs - now) / 1000),
    };
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: c.clientId,
    client_secret: c.clientSecret,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), c.timeoutMs);
  try {
    const res = await fetchImpl(c.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: controller.signal,
    });
    const text = await res.text();
    let json: { access_token?: string; expires_in?: number | string; error?: string; error_description?: string } =
      {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      /* non-JSON error body */
    }

    if (!res.ok || !json.access_token) {
      const detail = json.error_description || json.error || text.slice(0, 300) || res.statusText;
      throw new Error(`LinkedIn token request failed (${res.status}): ${detail}`);
    }

    const expiresIn = Number(json.expires_in) || 1800;
    cachedToken = {
      accessToken: json.access_token,
      expiresAtMs: now + expiresIn * 1000,
    };
    return { accessToken: json.access_token, expiresIn };
  } finally {
    clearTimeout(timer);
  }
}

/** Lightweight probe for setup / admin UI — does not require JOB_POSTING_ENABLED. */
export async function verifyLinkedInAccess(fetchImpl: typeof fetch = fetch): Promise<{
  configured: boolean;
  enabled: boolean;
  hasCredentials: boolean;
  hasCompanyUrn: boolean;
  tokenOk: boolean;
  error?: string;
}> {
  const c = linkedInConfig();
  const hasCredentials = Boolean(c.clientId && c.clientSecret);
  const hasCompanyUrn = Boolean(c.companyUrn);
  const result = {
    configured: linkedInJobPostingConfigured(),
    enabled: c.enabled,
    hasCredentials,
    hasCompanyUrn,
    tokenOk: false as boolean,
    error: undefined as string | undefined,
  };

  if (!hasCredentials) {
    result.error = 'Set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET';
    return result;
  }

  try {
    clearLinkedInTokenCache();
    await getLinkedInAccessToken(fetchImpl);
    result.tokenOk = true;
  } catch (err) {
    result.error = (err as Error).message;
  }
  return result;
}
