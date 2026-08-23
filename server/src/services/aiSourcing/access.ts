import type { NextFunction, Request, Response } from 'express';

/**
 * Suggested fine-grained permissions (no ACL table yet):
 *   AI_SOURCING_VIEW   — see the module / recent searches
 *   AI_SOURCING_SEARCH — run NL + structured searches
 *
 * Sprint 1 maps both to org roles that already access candidates.
 */
const AI_SOURCING_ROLES = new Set(['admin', 'recruiter', 'hiring_manager', 'super_admin']);

export const AI_SOURCING_VIEW = 'AI_SOURCING_VIEW';
export const AI_SOURCING_SEARCH = 'AI_SOURCING_SEARCH';

export function canViewAiSourcing(role: string | undefined): boolean {
  return !!role && AI_SOURCING_ROLES.has(role);
}

export function canSearchAiSourcing(role: string | undefined): boolean {
  return canViewAiSourcing(role);
}

export function requireAiSourcingView(req: Request, res: Response, next: NextFunction) {
  if (!canViewAiSourcing(req.user?.role)) {
    return res.status(403).json({
      error: 'AI Sourcing access required',
      code: 'AI_SOURCING_FORBIDDEN',
      permission: AI_SOURCING_VIEW,
    });
  }
  next();
}

export function requireAiSourcingSearch(req: Request, res: Response, next: NextFunction) {
  if (!canSearchAiSourcing(req.user?.role)) {
    return res.status(403).json({
      error: 'AI Sourcing search permission required',
      code: 'AI_SOURCING_FORBIDDEN',
      permission: AI_SOURCING_SEARCH,
    });
  }
  next();
}
