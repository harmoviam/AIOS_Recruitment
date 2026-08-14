import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearLinkedInTokenCache,
  getLinkedInAccessToken,
  linkedInJobPostingConfigured,
  verifyLinkedInAccess,
} from '../services/linkedin/auth.js';
import { submitSimpleJobPostings } from '../services/linkedin/jobPostingClient.js';
import {
  buildLocation,
  ensureLinkedInDescription,
  externalJobPostingId,
  LINKEDIN_DESCRIPTION_MIN_CHARS,
  mapEmploymentStatus,
  mapWorkplaceTypes,
  publicCareersApplyUrl,
  toLinkedInJobElement,
} from '../services/linkedin/jobPostingMapper.js';

afterEach(() => {
  vi.unstubAllEnvs();
  clearLinkedInTokenCache();
});

describe('jobPostingMapper', () => {
  it('builds stable external ids', () => {
    expect(externalJobPostingId(3, 42)).toBe('harmi-3-42');
  });

  it('maps employment and workplace types', () => {
    expect(mapEmploymentStatus('Part-time')).toBe('PART_TIME');
    expect(mapEmploymentStatus('Contract')).toBe('CONTRACT');
    expect(mapEmploymentStatus(null)).toBe('FULL_TIME');
    expect(mapWorkplaceTypes('Remote', null)).toEqual(['remote']);
    expect(mapWorkplaceTypes('Hybrid', null)).toEqual(['hybrid']);
    expect(mapWorkplaceTypes('Full-time', null)).toBeUndefined();
  });

  it('builds location and apply URL', () => {
    expect(
      buildLocation({
        id: 1,
        tenant_id: 1,
        title: 'Agent',
        city: 'Mohali',
        state: 'Punjab',
        country: 'India',
      })
    ).toBe('Mohali, Punjab, India');
    expect(
      publicCareersApplyUrl({
        appBaseUrl: 'https://app.example.com/',
        tenantSlug: 'staffpro-agency',
        jobId: 9,
      })
    ).toBe('https://app.example.com/careers/staffpro-agency/jobs/9');
  });

  it('pads short descriptions to LinkedIn minimum length', () => {
    const desc = ensureLinkedInDescription({
      id: 1,
      tenant_id: 1,
      title: 'Agent',
      description: 'Short JD',
      location: 'Mohali',
    });
    expect(desc.length).toBeGreaterThanOrEqual(LINKEDIN_DESCRIPTION_MIN_CHARS);
  });

  it('maps a CREATE element for BASIC SJP', () => {
    const listedAtMs = 1_700_000_000_000;
    const element = toLinkedInJobElement({
      job: {
        id: 9,
        tenant_id: 2,
        title: 'Voice Process Agent',
        description: 'Handle inbound calls for international voice process in Mohali with night shift options.',
        location: 'Mohali',
        city: 'Mohali',
        country: 'India',
        job_type: 'Full-time',
      },
      operation: 'CREATE',
      companyUrn: 'urn:li:company:123',
      companyApplyUrl: 'https://app.example.com/careers/demo/jobs/9',
      posterEmail: 'recruiter@example.com',
      listedAtMs,
    });
    expect(element).toMatchObject({
      jobPostingOperationType: 'CREATE',
      externalJobPostingId: 'harmi-2-9',
      listingType: 'BASIC',
      availability: 'PUBLIC',
      title: 'Voice Process Agent',
      company: 'urn:li:company:123',
      employmentStatus: 'FULL_TIME',
      listedAt: listedAtMs,
      location: 'Mohali, India',
      posterEmail: 'recruiter@example.com',
    });
    expect(element.description.length).toBeGreaterThanOrEqual(LINKEDIN_DESCRIPTION_MIN_CHARS);
    expect(String(element.listedAt).length).toBeGreaterThanOrEqual(13);
  });
});

describe('linkedIn auth', () => {
  it('reports not configured without env', () => {
    vi.stubEnv('LINKEDIN_JOB_POSTING_ENABLED', 'false');
    vi.stubEnv('LINKEDIN_CLIENT_ID', '');
    vi.stubEnv('LINKEDIN_CLIENT_SECRET', '');
    vi.stubEnv('LINKEDIN_COMPANY_URN', '');
    expect(linkedInJobPostingConfigured()).toBe(false);
  });

  it('caches access tokens from client_credentials', async () => {
    vi.stubEnv('LINKEDIN_CLIENT_ID', 'test-id');
    vi.stubEnv('LINKEDIN_CLIENT_SECRET', 'test-secret');
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'tok-1', expires_in: 1800 }), { status: 200 })
      );

    const first = await getLinkedInAccessToken(fetchImpl as unknown as typeof fetch);
    const second = await getLinkedInAccessToken(fetchImpl as unknown as typeof fetch);
    expect(first.accessToken).toBe('tok-1');
    expect(second.accessToken).toBe('tok-1');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('verifyLinkedInAccess surfaces token failures', async () => {
    vi.stubEnv('LINKEDIN_CLIENT_ID', 'test-id');
    vi.stubEnv('LINKEDIN_CLIENT_SECRET', 'test-secret');
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'access_denied', error_description: 'not allowed' }), {
        status: 401,
      })
    );
    const result = await verifyLinkedInAccess(fetchImpl as unknown as typeof fetch);
    expect(result.tokenOk).toBe(false);
    expect(result.error).toMatch(/not allowed|401/);
  });
});

describe('submitSimpleJobPostings smoke (mocked)', () => {
  it('CREATE → UPDATE → CLOSE against mocked LinkedIn API', async () => {
    vi.stubEnv('LINKEDIN_CLIENT_ID', 'test-id');
    vi.stubEnv('LINKEDIN_CLIENT_SECRET', 'test-secret');
    vi.stubEnv('LINKEDIN_API_VERSION', '202603');
    vi.stubEnv('LINKEDIN_API_BASE_URL', 'https://api.linkedin.test');

    const calls: Array<{ url: string; body?: unknown }> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/accessToken')) {
        return new Response(JSON.stringify({ access_token: 'tok', expires_in: 1800 }), { status: 200 });
      }
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({ url, body });
      return new Response(JSON.stringify({ elements: [{ status: 200 }] }), { status: 200 });
    });

    const base = {
      externalJobPostingId: 'harmi-1-1',
      listingType: 'BASIC' as const,
      availability: 'PUBLIC' as const,
      title: 'Agent',
      description:
        'Customer support agent for voice process. Full details and apply flow available on the careers page listing.',
      location: 'Mohali, India',
      company: 'urn:li:company:1',
      companyApplyUrl: 'https://app.example.com/careers/t/jobs/1',
      employmentStatus: 'FULL_TIME' as const,
      listedAt: 1_700_000_000_000,
      posterEmail: 'recruiter@example.com',
    };

    for (const op of ['CREATE', 'UPDATE', 'CLOSE'] as const) {
      const result = await submitSimpleJobPostings(
        [{ ...base, jobPostingOperationType: op }],
        fetchImpl as unknown as typeof fetch
      );
      expect(result.ok).toBe(true);
    }

    expect(calls).toHaveLength(3);
    expect(calls[0].url).toBe('https://api.linkedin.test/rest/simpleJobPostings');
    expect(calls.map((c) => (c.body as { elements: Array<{ jobPostingOperationType: string }> }).elements[0].jobPostingOperationType)).toEqual([
      'CREATE',
      'UPDATE',
      'CLOSE',
    ]);
  });
});
