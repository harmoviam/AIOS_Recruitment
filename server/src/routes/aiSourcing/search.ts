import { Router, type Request } from 'express';
import { z } from 'zod';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
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

const aiSourcingLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const userId = (req as Request).user?.id;
    return userId != null ? `ai-sourcing:${userId}` : ipKeyGenerator(req.ip ?? '');
  },
  message: { error: 'Too many AI sourcing requests. Wait a minute and try again.' },
});

const parseBodySchema = z.object({
  query: z.string().trim().min(3).max(1000),
});

const criteriaInputSchema = z
  .object({
    skills: z.array(z.string()).max(30).optional(),
    preferredSkills: z.array(z.string()).max(30).optional(),
    keywords: z.array(z.string()).max(30).optional(),
    roles: z.array(z.string()).max(10).optional(),
    industries: z.array(z.string()).max(15).optional(),
    jobTitle: z.string().max(120).nullable().optional(),
    location: z.string().max(120).nullable().optional(),
    seniority: z.string().max(40).nullable().optional(),
    minExperienceYears: z.number().min(0).max(50).nullable().optional(),
    maxExperienceYears: z.number().min(0).max(50).nullable().optional(),
    noticePeriodMaxDays: z.number().min(0).max(365).nullable().optional(),
    maxSalaryLpa: z.number().min(0).max(500).nullable().optional(),
    stage: z
      .enum(['applied', 'screening', 'interview', 'selected', 'email_sent', 'ho_pending', 'rejected', 'joined'])
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
  jobId: z.number().int().positive().optional().nullable(),
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
  aiSourcingLimiter,
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
  aiSourcingLimiter,
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
        jobId: body.jobId,
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
