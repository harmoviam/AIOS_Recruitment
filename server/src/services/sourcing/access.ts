import type { NextFunction, Request, Response } from 'express';

/** Entire Sourcing Copilot module is org-admin only (plus platform super_admin with tenant context). */
const SOURCING_ROLES = new Set(['admin', 'super_admin']);

export function canAccessSourcing(role: string | undefined): boolean {
  return !!role && SOURCING_ROLES.has(role);
}

export function canReadSourcing(role: string | undefined): boolean {
  return canAccessSourcing(role);
}

export function canWriteSourcing(role: string | undefined): boolean {
  return canAccessSourcing(role);
}

/** Org admin required for all sourcing read APIs. */
export function requireSourcingRead(req: Request, res: Response, next: NextFunction) {
  if (!canReadSourcing(req.user?.role)) {
    return res.status(403).json({ error: 'Organization admin access required for Sourcing Copilot' });
  }
  next();
}

/** Org admin required for all sourcing write APIs. */
export function requireSourcingWrite(req: Request, res: Response, next: NextFunction) {
  if (!canWriteSourcing(req.user?.role)) {
    return res.status(403).json({ error: 'Organization admin access required for Sourcing Copilot' });
  }
  next();
}

export function actorLabel(req: Request): string {
  return req.user?.email || String(req.user?.id ?? 'system');
}
