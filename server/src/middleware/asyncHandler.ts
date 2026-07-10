import type { NextFunction, Request, Response, RequestHandler } from 'express';

/** Forward async route errors to Express error middleware instead of crashing the process. */
export function asyncHandler(fn: RequestHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
