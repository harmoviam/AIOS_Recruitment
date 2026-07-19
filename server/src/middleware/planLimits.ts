import { Request, Response, NextFunction } from 'express';
import { pool } from '../db.js';

/**
 * Server-side plan limits matching the client's TENANT_PLANS catalog.
 * Enforced only on *create* endpoints — reads and logins are never blocked.
 * Billing routes are exempt everywhere so a lapsed tenant can always pay.
 */
export const PLAN_LIMITS: Record<string, { recruiters: number; candidates: number }> = {
  starter: { recruiters: 3, candidates: 2000 },
  pro: { recruiters: 15, candidates: 25000 },
  enterprise: { recruiters: Number.POSITIVE_INFINITY, candidates: Number.POSITIVE_INFINITY },
};

function limitsFor(plan: string) {
  return PLAN_LIMITS[plan] || PLAN_LIMITS.starter;
}

/**
 * Trial expired or paid period lapsed (with 7-day grace) → block writes.
 * Returns a 402 with code SUBSCRIPTION_REQUIRED that the client surfaces as
 * an upgrade prompt. Reads keep working (read-only lockout converts better
 * than a hard wall).
 */
export function enforceSubscriptionActive(req: Request, res: Response, next: NextFunction) {
  const tenant = req.tenant;
  if (!tenant) return next();
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.user?.role === 'super_admin') return next();

  const now = Date.now();
  const GRACE_MS = 7 * 24 * 60 * 60 * 1000;

  let blocked = false;
  let reason = '';
  if (tenant.status === 'trial' && tenant.trial_ends_at && new Date(tenant.trial_ends_at).getTime() < now) {
    blocked = true;
    reason = 'Your free trial has ended.';
  } else if (tenant.status === 'expired') {
    blocked = true;
    reason = 'Your subscription has expired.';
  } else if (
    tenant.status === 'active' &&
    tenant.plan_expires_at &&
    new Date(tenant.plan_expires_at).getTime() + GRACE_MS < now
  ) {
    blocked = true;
    reason = 'Your subscription payment is overdue.';
  }

  if (blocked) {
    return res.status(402).json({
      error: `${reason} Renew your plan in Settings → Billing to continue.`,
      code: 'SUBSCRIPTION_REQUIRED',
    });
  }
  next();
}

/** Block adding team members past the plan's recruiter-seat cap. */
export function enforceUserLimit() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenant = req.tenant;
      if (!tenant || req.user?.role === 'super_admin') return next();
      const cap = limitsFor(tenant.plan).recruiters;
      if (!Number.isFinite(cap)) return next();

      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS c FROM users WHERE tenant_id = $1 AND role IN ('recruiter', 'hiring_manager')`,
        [tenant.id]
      );
      if (rows[0].c >= cap) {
        return res.status(402).json({
          error: `Your ${tenant.plan} plan includes ${cap} team members. Upgrade in Settings → Billing to add more.`,
          code: 'PLAN_LIMIT',
          limit: cap,
        });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Soft candidate cap: allow up to 110% of the plan limit so an urgent add or
 * inbound applicant never bounces exactly at the line, then block.
 */
export function enforceCandidateLimit(countToAdd = 1) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenant = req.tenant;
      if (!tenant || req.user?.role === 'super_admin') return next();
      const cap = limitsFor(tenant.plan).candidates;
      if (!Number.isFinite(cap)) return next();

      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS c FROM candidates WHERE tenant_id = $1`,
        [tenant.id]
      );
      const requested = Array.isArray(req.body?.rows) ? req.body.rows.length : countToAdd;
      if (rows[0].c + requested > Math.floor(cap * 1.1)) {
        return res.status(402).json({
          error: `Your ${tenant.plan} plan includes ${cap.toLocaleString()} candidates. Upgrade in Settings → Billing to add more.`,
          code: 'PLAN_LIMIT',
          limit: cap,
        });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
