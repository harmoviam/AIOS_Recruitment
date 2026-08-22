import { describe, expect, it } from 'vitest';
import { buildHarmoviaCandidatePayload, retryDelayMs } from '../services/harmoviaCandidateSync.js';

describe('Harmovia candidate synchronization', () => {
  it('maps the primary AIOS job title to job.name', () => {
    const payload = buildHarmoviaCandidatePayload({
      outbox_id: 7,
      tenant_id: 3,
      tenant_slug: 'harmovia',
      candidate_id: 42,
      candidate_name: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: '9999999999',
      current_location: 'Bengaluru',
      highest_qualification: 'B.Tech',
      job_id: 12,
      job_name: 'Java Developer',
      attempts: 1,
    });

    expect(payload.job).toEqual({ id: 12, name: 'Java Developer' });
    expect(payload.candidate.id).toBe(42);
  });

  it('represents a candidate without a primary job as unassigned', () => {
    const payload = buildHarmoviaCandidatePayload({
      outbox_id: 8,
      tenant_id: 3,
      tenant_slug: 'harmovia',
      candidate_id: 43,
      candidate_name: 'Grace Hopper',
      email: null,
      phone: null,
      current_location: null,
      highest_qualification: null,
      job_id: null,
      job_name: null,
      attempts: 1,
    });

    expect(payload.job).toBeNull();
  });

  it('uses bounded exponential retry delays', () => {
    expect(retryDelayMs(1)).toBe(5_000);
    expect(retryDelayMs(20)).toBe(15 * 60_000);
  });
});

