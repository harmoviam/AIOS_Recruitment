import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  AutoSourcingService,
  isAutoRunDue,
  parseAutoRunConfig,
  DEFAULT_AUTO_RUN_MINUTES,
  MAX_AUTO_RUN_FAILURES,
  type AutoSourcingDeps,
} from '../services/aiSourcing/autoSourcingService.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

type FakeSearch = (
  req: unknown,
  jobId: number,
  opts: { limit?: number; offset?: number; refresh?: boolean }
) => Promise<{ id: string; resultCount: number }>;

type FakeOverrides = {
  rowsQueue?: Array<Array<Record<string, unknown>>>;
  searchBehavior?: FakeSearch;
};

function fakeDeps(overrides: FakeOverrides = {}) {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const rowsQueue: Array<Array<Record<string, unknown>>> = overrides.rowsQueue ?? [];
  const searchBehavior = overrides.searchBehavior ?? (async () => ({ id: 'search-1', resultCount: 7 }));
  const query = async (sql: string, params: unknown[]) => {
    queries.push({ sql, params });
    return { rows: rowsQueue.length ? (rowsQueue.shift() as Array<Record<string, unknown>>) : [] };
  };
  return { queries, query, searchBehavior };
}

function makeService(fakes: ReturnType<typeof fakeDeps>) {
  return new AutoSourcingService({
    query: fakes.query,
    searchFromJob: fakes.searchBehavior as unknown as AutoSourcingDeps['searchFromJob'],
  });
}

describe('parseAutoRunConfig', () => {
  it('defaults to enabled with a 6h interval', () => {
    vi.stubEnv('AI_SOURCING_AUTO_RUN', undefined as unknown as string);
    vi.stubEnv('AI_SOURCING_ENABLED', undefined as unknown as string);
    expect(parseAutoRunConfig()).toEqual({ enabled: true, intervalMinutes: 360, maxJobsPerTick: 20 });
  });

  it('honors the kill-switch and clamps ranges', () => {
    vi.stubEnv('AI_SOURCING_AUTO_RUN', 'false');
    expect(parseAutoRunConfig().enabled).toBe(false);
    vi.stubEnv('AI_SOURCING_AUTO_RUN', 'true');
    vi.stubEnv('AI_SOURCING_AUTO_RUN_MINUTES', '5');
    expect(parseAutoRunConfig().intervalMinutes).toBe(15);
    vi.stubEnv('AI_SOURCING_AUTO_RUN_MINUTES', '99999');
    expect(parseAutoRunConfig().intervalMinutes).toBe(4320);
    expect(DEFAULT_AUTO_RUN_MINUTES).toBe(360);
  });
});

describe('isAutoRunDue', () => {
  it('treats never-run and stale runs as due', () => {
    expect(isAutoRunDue(null, 360)).toBe(true);
    expect(isAutoRunDue('not-a-date', 360)).toBe(true);
    const old = new Date(Date.now() - 7 * 3_600_000).toISOString();
    expect(isAutoRunDue(old, 360)).toBe(true);
    const fresh = new Date(Date.now() - 60_000).toISOString();
    expect(isAutoRunDue(fresh, 360)).toBe(false);
  });
});

describe('watch / unwatch', () => {
  it('rejects invalid job ids without touching the DB', async () => {
    const fakes = fakeDeps();
    const svc = makeService(fakes);
    await expect(svc.watch(1, 9, 0)).rejects.toMatchObject({ status: 400 });
    expect(fakes.queries).toHaveLength(0);
  });

  it('returns 404 when the job is missing or inactive', async () => {
    const fakes = fakeDeps({ rowsQueue: [[]] });
    const svc = makeService(fakes);
    await expect(svc.watch(1, 9, 42)).rejects.toMatchObject({ status: 404 });
  });

  it('upserts a watch for an active job', async () => {
    const fakes = fakeDeps({
      rowsQueue: [
        [{ id: 42, title: 'DevOps Engineer' }],
        [
          {
            job_id: 42,
            enabled: true,
            interval_minutes: 360,
            last_run_at: null,
            last_search_id: null,
            last_result_count: 0,
            last_error: null,
            consecutive_failures: 0,
            updated_at: new Date().toISOString(),
          },
        ],
      ],
    });
    const svc = makeService(fakes);
    const item = await svc.watch(1, 9, 42);
    expect(item.jobId).toBe(42);
    expect(item.jobTitle).toBe('DevOps Engineer');
    expect(fakes.queries[1].sql).toMatch(/ON CONFLICT \(tenant_id, job_id\)/);
  });
});

describe('runDueOnce', () => {
  it('does nothing when globally disabled', async () => {
    vi.stubEnv('AI_SOURCING_AUTO_RUN', 'false');
    const fakes = fakeDeps();
    const svc = makeService(fakes);
    const summary = await svc.runDueOnce();
    expect(summary).toMatchObject({ ran: 0, disabled: true });
    expect(fakes.queries).toHaveLength(0);
  });

  it('re-sources due jobs and records success', async () => {
    vi.stubEnv('AI_SOURCING_AUTO_RUN', 'true');
    const searches: Array<{ jobId: number }> = [];
    const fakes = fakeDeps({
      rowsQueue: [
        [{ tenant_id: 1, job_id: 42, enabled_by: 9, interval_minutes: 360, last_run_at: null, consecutive_failures: 0 }],
        [],
      ],
      searchBehavior: (async (_req: unknown, jobId: number) => {
        searches.push({ jobId });
        return { id: 'search-9', resultCount: 12 };
      }) as never,
    });
    const svc = makeService(fakes);
    const summary = await svc.runDueOnce();
    expect(summary).toMatchObject({ ran: 1, succeeded: 1, failed: 0 });
    expect(searches).toEqual([{ jobId: 42 }]);
    expect(fakes.queries[1].sql).toMatch(/last_search_id/);
    expect(fakes.queries[1].params).toContain('search-9');
  });

  it('records failures and disables after repeated failures', async () => {
    vi.stubEnv('AI_SOURCING_AUTO_RUN', 'true');
    const fakes = fakeDeps({
      rowsQueue: [
        [{ tenant_id: 1, job_id: 7, enabled_by: 9, interval_minutes: 60, last_run_at: null, consecutive_failures: 0 }],
        [],
      ],
      searchBehavior: (async () => {
        throw new Error('vector db down');
      }) as never,
    });
    const svc = makeService(fakes);
    const summary = await svc.runDueOnce();
    expect(summary).toMatchObject({ ran: 1, succeeded: 0, failed: 1 });
    expect(fakes.queries[1].sql).toMatch(/consecutive_failures \+ 1/);
    expect(MAX_AUTO_RUN_FAILURES).toBe(5);
  });
});
