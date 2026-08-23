import { getLinkedInAccessToken, linkedInConfig } from './auth.js';
import type { LinkedInJobPostingElement } from './jobPostingMapper.js';

export interface LinkedInJobPostingBatchResult {
  ok: boolean;
  status: number;
  body: unknown;
  error?: string;
}

export async function submitSimpleJobPostings(
  elements: LinkedInJobPostingElement[],
  fetchImpl: typeof fetch = fetch
): Promise<LinkedInJobPostingBatchResult> {
  if (!elements.length) {
    return { ok: false, status: 400, body: null, error: 'No job posting elements to submit' };
  }

  const c = linkedInConfig();
  const { accessToken } = await getLinkedInAccessToken(fetchImpl);
  const url = `${c.baseApiUrl}/rest/simpleJobPostings`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), c.timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'x-restli-method': 'batch_create',
        'Linkedin-Version': c.apiVersion,
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify({ elements }),
      signal: controller.signal,
    });

    const text = await res.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }

    if (!res.ok) {
      const errMsg =
        typeof body === 'object' && body && 'message' in body
          ? String((body as { message: unknown }).message)
          : text.slice(0, 500) || res.statusText;
      return { ok: false, status: res.status, body, error: errMsg };
    }

    return { ok: true, status: res.status, body };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      body: null,
      error: (err as Error).message || 'LinkedIn job posting request failed',
    };
  } finally {
    clearTimeout(timer);
  }
}
