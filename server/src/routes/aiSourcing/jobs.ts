import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import {
  requireAiSourcingSearch,
  requireAiSourcingView,
} from '../../services/aiSourcing/access.js';
import { jdIntelligenceService } from '../../services/aiSourcing/jdIntelligenceService.js';
import { searchRequirementService } from '../../services/aiSourcing/searchRequirementService.js';

const router = Router();

function parseJobId(raw: string): number | null {
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

router.post(
  '/jobs/:jobId/analyze',
  requireAiSourcingSearch,
  asyncHandler(async (req, res) => {
    const jobId = parseJobId(String(req.params.jobId || ''));
    if (!jobId) return res.status(400).json({ error: 'Invalid job id' });
    try {
      const result = await jdIntelligenceService.analyze(req, jobId);
      res.json(result);
    } catch (err) {
      const e = err as { status?: number; message?: string };
      if (e.status === 404) return res.status(404).json({ error: e.message || 'Job not found' });
      throw err;
    }
  })
);

router.get(
  '/jobs/:jobId/intelligence',
  requireAiSourcingView,
  asyncHandler(async (req, res) => {
    const jobId = parseJobId(String(req.params.jobId || ''));
    if (!jobId) return res.status(400).json({ error: 'Invalid job id' });
    try {
      const result = await jdIntelligenceService.get(req, jobId);
      if (!result) return res.status(404).json({ error: 'Job intelligence not found — run analyze first' });
      res.json(result);
    } catch (err) {
      const e = err as { status?: number; message?: string };
      if (e.status === 404) return res.status(404).json({ error: e.message || 'Job not found' });
      throw err;
    }
  })
);

const jobSearchSchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
  refresh: z.boolean().optional(),
});

router.post(
  '/jobs/:jobId/search',
  requireAiSourcingSearch,
  asyncHandler(async (req, res) => {
    const jobId = parseJobId(String(req.params.jobId || ''));
    if (!jobId) return res.status(400).json({ error: 'Invalid job id' });
    try {
      const body = jobSearchSchema.parse(req.body ?? {});
      const result = await searchRequirementService.searchFromJob(req, jobId, body);
      res.status(201).json(result);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid request', details: err.flatten() });
      }
      const e = err as { status?: number; message?: string };
      if (e.status === 404) return res.status(404).json({ error: e.message || 'Job not found' });
      if (e.status === 400) return res.status(400).json({ error: e.message || 'Invalid criteria' });
      throw err;
    }
  })
);

export default router;
