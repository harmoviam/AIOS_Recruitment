import type { Request } from 'express';
import { pool } from '../../db.js';
import { isAiSourcingEnabled } from './featureFlag.js';
import { searchRequirementService } from './searchRequirementService.js';

/**
 * 24/7 background auto-sourcing.
 *
 * Recruiters "watch" open jobs; the worker re-runs sourcing for watched jobs
 * on their interval so shortlists stay fresh without anyone clicking.
 * Runs in-process on a timer (same pattern as the Harmovia sync worker) —
 * no Redis/queue required. Each tick only touches rows that are due, and a
 * watch auto-disables after repeated failures so one broken job can't spam.
 */

export type AutoRunConfig = {
  enabled: boolean;
  intervalMinutes: number;
  maxJobsPerTick: number;
};

export const DEFAULT_AUTO_RUN_MINUTES = 360;
export const MAX_AUTO_RUN_FAILURES = 5;

/** Env config: AI_SOURCING_AUTO_RUN=false is the global kill-switch. */
export function parseAutoRunConfig(env: NodeJS.ProcessEnv = process.env): AutoRunConfig {
  const minutes = Number(env.AI_SOURCING_AUTO_RUN_MINUTES);
  const maxJobs = Number(env.AI_SOURCING_AUTO_RUN_MAX_JOBS);
  return {
    enabled: env.AI_SOURCING_AUTO_RUN !== 'false' && isAiSourcingEnabled(),
    intervalMinutes: Math.min(
      Math.max(Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_AUTO_RUN_MINUTES, 15),
      4320
    ),
    maxJobsPerTick: Math.min(
      Math.max(Number.isFinite(maxJobs) && maxJobs > 0 ? maxJobs : 20, 1),
      100
    ),
  };
}

/** A watch with no successful run yet is always due. Exported for tests. */
export function isAutoRunDue(
  lastRunAt: string | null,
  intervalMinutes: number,
  nowMs: number = Date.now()
): boolean {
  if (!lastRunAt) return true;
  const last = new Date(lastRunAt).getTime();
  if (!Number.isFinite(last)) return true;
  return nowMs - last >= intervalMinutes * 60_000;
}

export type AutoRunItem = {
  jobId: number;
  jobTitle: string | null;
  enabled: boolean;
  intervalMinutes: number;
  lastRunAt: string | null;
  lastSearchId: string | null;
  lastResultCount: number;
  lastError: string | null;
  consecutiveFailures: number;
  updatedAt: string;
};

export type AutoRunTickSummary = {
  ran: number;
  succeeded: number;
  failed: number;
  skipped: boolean;
  disabled: boolean;
};

type QueryFn = (sql: string, params: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
type SearchFromJobFn = (
  req: Request,
  jobId: number,
  opts: { limit?: number; offset?: number; refresh?: boolean }
) => Promise<{ id: string; resultCount: number }>;

export type AutoSourcingDeps = {
  query: QueryFn;
  searchFromJob: SearchFromJobFn;
};

const defaultDeps: AutoSourcingDeps = {
  query: (sql, params) => pool.query(sql, params),
  searchFromJob: (req, jobId, opts) => searchRequirementService.searchFromJob(req, jobId, opts),
};

/** Minimal tenant-admin request context for background runs (never crosses tenants). */
export function backgroundReq(tenantId: number, userId: number | null): Request {
  return {
    tenant: { id: tenantId },
    user: { id: userId ?? 0, role: 'admin' },
  } as unknown as Request;
}

function toItem(row: Record<string, unknown>): AutoRunItem {
  return {
    jobId: row.job_id as number,
    jobTitle: (row.job_title as string) ?? null,
    enabled: Boolean(row.enabled),
    intervalMinutes: Number(row.interval_minutes) || DEFAULT_AUTO_RUN_MINUTES,
    lastRunAt: row.last_run_at ? new Date(row.last_run_at as string).toISOString() : null,
    lastSearchId: (row.last_search_id as string) ?? null,
    lastResultCount: Number(row.last_result_count) || 0,
    lastError: (row.last_error as string) ?? null,
    consecutiveFailures: Number(row.consecutive_failures) || 0,
    updatedAt: new Date(row.updated_at as string).toISOString(),
  };
}

export class AutoSourcingService {
  constructor(private readonly deps: AutoSourcingDeps = defaultDeps) {}

  async listWatched(tenantId: number): Promise<AutoRunItem[]> {
    const { rows } = await this.deps.query(
      `SELECT w.tenant_id, w.job_id, j.title AS job_title, w.enabled, w.interval_minutes,
              w.last_run_at, w.last_search_id, w.last_result_count, w.last_error,
              w.consecutive_failures, w.updated_at
       FROM ai_sourcing_auto_runs w
       JOIN jobs j ON j.id = w.job_id AND j.tenant_id = w.tenant_id
       WHERE w.tenant_id = $1
       ORDER BY w.updated_at DESC`,
      [tenantId]
    );
    return rows.map(toItem);
  }

  async watch(tenantId: number, userId: number, jobId: number, intervalMinutes?: number): Promise<AutoRunItem> {
    if (!Number.isInteger(jobId) || jobId <= 0) {
      throw Object.assign(new Error('Invalid job id'), { status: 400 });
    }
    if (intervalMinutes != null && !Number.isFinite(intervalMinutes)) {
      throw Object.assign(new Error('Invalid intervalMinutes'), { status: 400 });
    }
    const interval =
      intervalMinutes == null
        ? parseAutoRunConfig().intervalMinutes
        : Math.min(Math.max(Math.floor(intervalMinutes), 15), 4320);
    const job = await this.deps.query(
      `SELECT id, title FROM jobs WHERE id = $1 AND tenant_id = $2 AND status = 'active'`,
      [jobId, tenantId]
    );
    if (!job.rows[0]) {
      throw Object.assign(new Error('Active job not found'), { status: 404 });
    }
    const { rows } = await this.deps.query(
      `INSERT INTO ai_sourcing_auto_runs (tenant_id, job_id, enabled_by, interval_minutes, enabled, updated_at)
       VALUES ($1, $2, $3, $4, TRUE, NOW())
       ON CONFLICT (tenant_id, job_id) DO UPDATE SET
         enabled = TRUE, interval_minutes = EXCLUDED.interval_minutes,
         enabled_by = EXCLUDED.enabled_by, consecutive_failures = 0,
         last_error = NULL, updated_at = NOW()
       RETURNING tenant_id, job_id, enabled, interval_minutes, last_run_at,
                 last_search_id, last_result_count, last_error, consecutive_failures, updated_at`,
      [tenantId, jobId, userId, interval]
    );
    return toItem({ ...rows[0], job_title: job.rows[0].title });
  }

  async unwatch(tenantId: number, jobId: number): Promise<boolean> {
    const { rows } = await this.deps.query(
      `DELETE FROM ai_sourcing_auto_runs WHERE tenant_id = $1 AND job_id = $2 RETURNING id`,
      [tenantId, jobId]
    );
    return rows.length > 0;
  }

  /**
   * Run one tick: re-source every due watched job for every tenant.
   * Auto-runs reuse stored JD intelligence (refresh: false) — no extra LLM
   * cost beyond what recruiters already trigger manually.
   */
  async runDueOnce(): Promise<AutoRunTickSummary> {
    const cfg = parseAutoRunConfig();
    if (!cfg.enabled) return { ran: 0, succeeded: 0, failed: 0, skipped: false, disabled: true };
    const { rows } = await this.deps.query(
      `SELECT w.tenant_id, w.job_id, w.enabled_by, w.interval_minutes,
              w.last_run_at, w.consecutive_failures
       FROM ai_sourcing_auto_runs w
       JOIN jobs j ON j.id = w.job_id AND j.tenant_id = w.tenant_id
       WHERE w.enabled AND w.consecutive_failures < $1 AND j.status = 'active'
         AND (w.last_run_at IS NULL
              OR w.last_run_at < NOW() - (w.interval_minutes * INTERVAL '1 minute'))
       ORDER BY w.last_run_at NULLS FIRST
       LIMIT $2`,
      [MAX_AUTO_RUN_FAILURES, cfg.maxJobsPerTick]
    );
    let succeeded = 0;
    let failed = 0;
    for (const row of rows) {
      const tenantId = row.tenant_id as number;
      const jobId = row.job_id as number;
      try {
        const result = await this.deps.searchFromJob(backgroundReq(tenantId, (row.enabled_by as number) ?? null), jobId, {
          refresh: false,
        });
        await this.deps.query(
          `UPDATE ai_sourcing_auto_runs
           SET last_run_at = NOW(), last_search_id = $3, last_result_count = $4,
               last_error = NULL, consecutive_failures = 0, updated_at = NOW()
           WHERE tenant_id = $1 AND job_id = $2`,
          [tenantId, jobId, result.id, result.resultCount]
        );
        succeeded += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[ai-sourcing] auto-run failed for job ${jobId}:`, message);
        await this.deps.query(
          `UPDATE ai_sourcing_auto_runs
           SET last_error = $3, consecutive_failures = consecutive_failures + 1,
               enabled = CASE WHEN consecutive_failures + 1 >= $4 THEN FALSE ELSE enabled END,
               updated_at = NOW()
           WHERE tenant_id = $1 AND job_id = $2`,
          [tenantId, jobId, message.slice(0, 500), MAX_AUTO_RUN_FAILURES]
        );
        failed += 1;
      }
    }
    return { ran: rows.length, succeeded, failed, skipped: false, disabled: false };
  }
}

export const autoSourcingService = new AutoSourcingService();

let running = false;

/** Start the 24/7 worker on server boot (timer unref'd; skips overlapping ticks). */
export function startAutoSourcingWorker(): NodeJS.Timeout | null {
  const cfg = parseAutoRunConfig();
  if (!cfg.enabled) {
    console.log('AI sourcing auto-run disabled (set AI_SOURCING_AUTO_RUN=true to enable)');
    return null;
  }
  console.log(
    `AI sourcing auto-run enabled: watched jobs re-sourced every ${cfg.intervalMinutes} min default`
  );
  const run = () => {
    if (running) return;
    running = true;
    autoSourcingService
      .runDueOnce()
      .catch((error) => {
        console.warn('[ai-sourcing] auto-run tick failed:', (error as Error).message);
      })
      .finally(() => {
        running = false;
      });
  };
  run();
  const timer = setInterval(run, Math.min(cfg.intervalMinutes, 60) * 60_000);
  timer.unref();
  return timer;
}
