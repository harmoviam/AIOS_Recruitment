import type { Request } from 'express';
import { pool } from '../db.js';

/**
 * Single source of truth for "which candidates may this user touch".
 *
 * Roles:
 *  - admin / super_admin — every candidate in the tenant.
 *  - recruiter           — only candidates they own.
 *  - hiring_manager      — candidates they own plus those owned by recruiters
 *                          explicitly assigned to them (users.managed_by_id).
 *
 * Assignment is strictly `managed_by_id`. A recruiter who shares a company with
 * an HM but has no manager set is NOT visible — sharing a company_id used to be
 * a fallback here, which leaked candidates between HMs of the same company.
 */
export type HmScope = 'my' | 'team';

export function candidateScopeSql(
  req: Request,
  alias = 'c',
  startIndex = 1,
  hmScope?: HmScope
) {
  const role = req.user!.role;
  const col = `${alias}.recruiter_id`;

  if (role === 'recruiter') {
    return {
      sql: ` AND ${col} = $${startIndex}`,
      params: [req.user!.id] as unknown[],
      nextIndex: startIndex + 1,
    };
  }

  if (role === 'hiring_manager') {
    // Only the list/export views expose the my/team toggle; everywhere else an
    // HM sees the union, which is what the guard on by-id routes must allow.
    if (hmScope === 'my') {
      return {
        sql: ` AND ${col} = $${startIndex}`,
        params: [req.user!.id] as unknown[],
        nextIndex: startIndex + 1,
      };
    }
    const team = `${col} IN (
      SELECT r.id FROM users r
      WHERE r.tenant_id = $${startIndex + 1} AND r.role = 'recruiter'
        AND r.managed_by_id = $${startIndex}
    )`;
    return {
      sql: hmScope === 'team' ? ` AND (${team})` : ` AND (${col} = $${startIndex} OR ${team})`,
      params: [req.user!.id, req.tenant!.id] as unknown[],
      nextIndex: startIndex + 2,
    };
  }

  return { sql: '', params: [] as unknown[], nextIndex: startIndex };
}

/**
 * Admin/org filter: candidates owned by a hiring manager or by recruiters
 * assigned to that HM (`users.managed_by_id`). Same union as an HM's default scope.
 */
export function hmCandidateFilterSql(
  hmId: number,
  tenantId: number,
  alias = 'c',
  startIndex = 1
) {
  const col = `${alias}.recruiter_id`;
  return {
    sql: ` AND (${col} = $${startIndex} OR ${col} IN (
      SELECT r.id FROM users r
      WHERE r.tenant_id = $${startIndex + 1} AND r.role = 'recruiter'
        AND r.managed_by_id = $${startIndex}
    ))`,
    params: [hmId, tenantId] as unknown[],
    nextIndex: startIndex + 2,
  };
}

/**
 * Guard for by-id routes. Tenant membership alone is not enough — without this
 * a recruiter or HM could read and edit any candidate in the workspace by URL.
 */
export async function assertCandidateAccess(req: Request, candidateId: number): Promise<boolean> {
  if (!Number.isFinite(candidateId)) return false;
  const scope = candidateScopeSql(req, 'c', 3);
  const { rows } = await pool.query(
    `SELECT 1 FROM candidates c WHERE c.id = $1 AND c.tenant_id = $2${scope.sql}`,
    [candidateId, req.tenant!.id, ...scope.params]
  );
  return rows.length > 0;
}
