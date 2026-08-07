import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import {
  requireAiSourcingSearch,
  requireAiSourcingView,
} from '../../services/aiSourcing/access.js';
import {
  RECOMMENDED_SEARCHES,
  searchRequirementService,
} from '../../services/aiSourcing/searchRequirementService.js';

const router = Router();

const parseBodySchema = z.object({
  query: z.string().trim().min(3).max(1000),
});

const criteriaInputSchema = z
  .object({
    skills: z.array(z.string()).max(30).optional(),
    keywords: z.array(z.string()).max(30).optional(),
    jobTitle: z.string().max(120).nullable().optional(),
    location: z.string().max(120).nullable().optional(),
    minExperienceYears: z.number().min(0).max(50).nullable().optional(),
    maxExperienceYears: z.number().min(0).max(50).nullable().optional(),
    stage: z
      .enum(['applied', 'screening', 'interview', 'selected', 'rejected', 'joined'])
      .nullable()
      .optional(),
    minAiScore: z.number().min(0).max(10).nullable().optional(),
  })
  .optional();

const searchBodySchema = z.object({
  query: z.string().trim().max(1000).optional().default(''),
  criteria: criteriaInputSchema,
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

function zodBadRequest(res: import('express').Response, err: unknown): boolean {
  if (err instanceof z.ZodError) {
    res.status(400).json({ error: 'Invalid request', code: 'VALIDATION_ERROR', details: err.flatten() });
    return true;
  }
  return false;
}

router.post(
  '/parse',
  requireAiSourcingSearch,
  asyncHandler(async (req, res) => {
    try {
      const body = parseBodySchema.parse(req.body);
      const result = await searchRequirementService.parseOnly(body.query);
      res.json(result);
    } catch (err) {
      if (zodBadRequest(res, err)) return;
      throw err;
    }
  })
);

router.post(
  '/search',
  requireAiSourcingSearch,
  asyncHandler(async (req, res) => {
    try {
      const body = searchBodySchema.parse(req.body);
      if (!body.query && !body.criteria) {
        return res.status(400).json({ error: 'Provide query and/or criteria' });
      }
      const query =
        body.query && body.query.trim().length >= 3
          ? body.query.trim()
          : body.criteria
            ? 'Structured search'
            : '';
      if (!query) {
        return res.status(400).json({ error: 'Query must be at least 3 characters' });
      }
      const result = await searchRequirementService.searchAndPersist(req, {
        query,
        criteria: body.criteria,
        limit: body.limit,
        offset: body.offset,
      });
      res.status(201).json(result);
    } catch (err) {
      if (zodBadRequest(res, err)) return;
      const e = err as { status?: number; message?: string };
      if (e.status === 400) return res.status(400).json({ error: e.message || 'Invalid criteria' });
      throw err;
    }
  })
);

router.get(
  '/search/:id',
  requireAiSourcingView,
  asyncHandler(async (req, res) => {
    const id = String(req.params.id || '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return res.status(400).json({ error: 'Invalid search id' });
    }
    const row = await searchRequirementService.getById(req, id);
    if (!row) return res.status(404).json({ error: 'Search not found' });
    res.json(row);
  })
);

router.get(
  '/searches/recent',
  requireAiSourcingView,
  asyncHandler(async (req, res) => {
    const limit = Number(req.query.limit) || 10;
    const items = await searchRequirementService.listRecent(req, limit);
    res.json({ items });
  })
);

router.get(
  '/recommended',
  requireAiSourcingView,
  asyncHandler(async (_req, res) => {
    res.json({ items: RECOMMENDED_SEARCHES });
  })
);

export default router;
