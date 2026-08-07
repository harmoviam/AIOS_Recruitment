import type { Request } from 'express';

/**
 * Request-scoped context for every agent tool call.
 * Tools never talk to the DB without going through this + existing services.
 */
export interface AgentContext {
  tenantId: number;
  userId: number;
  userRole: string;
  /** Optional job the recruiter is working in (from chat body or session). */
  jobId?: number | null;
  /** Express request — used for candidateScopeSql / assertCandidateAccess. */
  req: Request;
}

export function agentContextFromRequest(
  req: Request,
  opts?: { jobId?: number | null }
): AgentContext {
  return {
    tenantId: req.tenant!.id,
    userId: req.user!.id,
    userRole: req.user!.role,
    jobId: opts?.jobId ?? null,
    req,
  };
}
