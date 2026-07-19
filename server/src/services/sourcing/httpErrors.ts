import type { Response } from 'express';
import { ZodError } from 'zod';
import { VersionConflictError } from '../../repositories/sourcing/countryRepository.js';

export function handleSourcingError(res: Response, err: unknown): Response | void {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation Failed',
      details: err.issues.map((i) => ({
        field: i.path.join('.') || '(root)',
        message: i.message,
      })),
    });
  }
  if (err instanceof VersionConflictError || (err as { code?: string }).code === 'VERSION_CONFLICT') {
    return res.status(409).json({ error: 'Version conflict — reload and retry' });
  }
  const pgCode = (err as { code?: string }).code;
  if (pgCode === '23505') {
    return res.status(409).json({ error: 'Duplicate record for this tenant' });
  }
  if (pgCode === '23503') {
    return res.status(400).json({ error: 'Referenced record not found or not in this tenant' });
  }
  throw err;
}
