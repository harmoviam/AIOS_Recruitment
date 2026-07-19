import { Request, Response, NextFunction } from 'express';
import { pool } from '../db.js';
import { enforceSubscriptionActive } from './planLimits.js';

export interface TenantRecord {
  id: number;
  slug: string;
  name: string;
  plan: string;
  status: string;
  primary_color: string;
  logo_initials: string;
  logo_path: string | null;
  features: string[];
  trial_ends_at?: string | null;
  plan_expires_at?: string | null;
}

/** Public URL for a tenant logo, cache-busted by storage key. */
export function publicTenantLogoUrl(slug: string, logoPath: string | null | undefined): string | null {
  if (!logoPath) return null;
  const v = logoPath.split('/').pop()?.replace(/\W/g, '').slice(-12) || '1';
  return `/api/public/${encodeURIComponent(slug)}/logo?v=${v}`;
}

declare global {
  namespace Express {
    interface Request {
      tenant?: TenantRecord;
    }
  }
}

export async function loadTenantBySlug(slug: string): Promise<TenantRecord | null> {
  const { rows } = await pool.query(
    `SELECT id, slug, name, plan, status, primary_color, logo_initials, logo_path, features,
            trial_ends_at, plan_expires_at
     FROM tenants WHERE slug = $1 AND status != 'churned'`,
    [slug]
  );
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    ...r,
    logo_path: r.logo_path || null,
    features: Array.isArray(r.features) ? r.features : JSON.parse(r.features || '[]'),
  };
}

export async function loadTenantById(id: number): Promise<TenantRecord | null> {
  const { rows } = await pool.query(
    `SELECT id, slug, name, plan, status, primary_color, logo_initials, logo_path, features,
            trial_ends_at, plan_expires_at
     FROM tenants WHERE id = $1`,
    [id]
  );
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    ...r,
    logo_path: r.logo_path || null,
    features: Array.isArray(r.features) ? r.features : JSON.parse(r.features || '[]'),
  };
}

/** Resolve tenant after auth. Sets req.tenant for tenant-scoped routes. */
export async function tenantMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const headerSlug = (req.headers['x-tenant-slug'] as string | undefined)?.trim().toLowerCase();
    const isPlatformRoute = req.baseUrl.startsWith('/platform') || req.path.startsWith('/platform');

    if (req.user.role === 'super_admin') {
      if (headerSlug) {
        const tenant = await loadTenantBySlug(headerSlug);
        if (!tenant) return res.status(404).json({ error: 'Workspace not found' });
        req.tenant = tenant;
      } else if (!isPlatformRoute) {
        return res.status(400).json({ error: 'X-Tenant-Slug header required for super admin' });
      }
      return next();
    }

    // Regular tenant user — always scoped to their tenant (ignore spoofed slug)
    if (req.user.tenant_id == null) {
      return res.status(403).json({ error: 'User is not assigned to a workspace' });
    }

    const tenant = await loadTenantById(req.user.tenant_id);
    if (!tenant) return res.status(404).json({ error: 'Workspace not found' });

    // Regular users are always scoped to JWT tenant_id — a stale X-Tenant-Slug from
    // localStorage must not block API access after switching org login URLs.
    req.tenant = tenant;
    next();
  } catch (err) {
    console.error('tenantMiddleware failed:', (err as Error).message);
    next(err);
  }
}

/**
 * Ensures req.tenant is set — use on all tenant-data routes.
 * Also the single enforcement point for subscription state: expired trials and
 * lapsed plans get read-only access (402 on writes). Billing stays writable so
 * a lapsed tenant can always pay.
 */
export function requireTenant(req: Request, res: Response, next: NextFunction) {
  if (!req.tenant) {
    return res.status(400).json({ error: 'Workspace context required' });
  }
  if (!req.baseUrl.startsWith('/api/billing')) {
    return enforceSubscriptionActive(req, res, next);
  }
  next();
}

export function platformAdminOnly(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== 'super_admin') {
    return res.status(403).json({ error: 'Platform admin access required' });
  }
  next();
}

/** SQL fragment: AND alias.tenant_id = $n */
export function tenantClause(tenantId: number, alias: string, paramIndex: number) {
  const col = alias ? `${alias}.tenant_id` : 'tenant_id';
  return { sql: `${col} = $${paramIndex}`, param: tenantId, nextIndex: paramIndex + 1 };
}

export async function assertCandidateInTenant(
  candidateId: number,
  tenantId: number
): Promise<boolean> {
  const { rows } = await pool.query(
    'SELECT 1 FROM candidates WHERE id = $1 AND tenant_id = $2',
    [candidateId, tenantId]
  );
  return rows.length > 0;
}

export async function assertJobInTenant(jobId: number, tenantId: number): Promise<boolean> {
  const { rows } = await pool.query('SELECT 1 FROM jobs WHERE id = $1 AND tenant_id = $2', [
    jobId,
    tenantId,
  ]);
  return rows.length > 0;
}
