import type { NextFunction, Request, Response } from 'express';

/** Env feature flag — unset defaults to enabled for local/dev DX. */
export function isAiSourcingEnabled(): boolean {
  return process.env.AI_SOURCING_ENABLED !== 'false';
}

export function requireAiSourcingEnabled(_req: Request, res: Response, next: NextFunction) {
  if (!isAiSourcingEnabled()) {
    return res.status(403).json({
      error: 'AI Sourcing is disabled on this server',
      code: 'AI_SOURCING_DISABLED',
    });
  }
  next();
}
