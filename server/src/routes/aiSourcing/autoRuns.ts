import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import {
  requireAiSourcingSearch,
  requireAiSourcingView,
} from '../../services/aiSourcing/access.js';
import { autoSourcingService } from '../../services/aiSourcing/autoSourcingService.js';

const router = Router();

const watchSchema = z.object({
  jobId: z.number().int().positive(),
  intervalMinutes: z.number().int().min(15).max(4320).optional(),
});

router.get(
  '/auto-runs',
  requireAiSourcingView,
  asyncHandler(async (req, res) => {
    const items = await autoSourcingService.listWatched(req.tenant!.id);
    res.json({ items });
  })
);

router.post(
  '/auto-runs',
  requireAiSourcingSearch,
  asyncHandler(async (req, res) => {
    try {
      const body = watchSchema.parse(req.body);
      const item = await autoSourcingService.watch(
        req.tenant!.id,
        req.user!.id,
        body.jobId,
        body.intervalMinutes
      );
      res.status(201).json(item);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid request', details: err.flatten() });
      }
      const e = err as { status?: number; message?: string };
      if (e.status === 404) return res.status(404).json({ error: e.message || 'Job not found' });
      if (e.status === 400) return res.status(400).json({ error: e.message || 'Invalid request' });
      throw err;
    }
  })
);

router.delete(
  '/auto-runs/:jobId',
  requireAiSourcingSearch,
  asyncHandler(async (req, res) => {
    const jobId = Number(req.params.jobId);
    if (!Number.isInteger(jobId) || jobId <= 0) {
      return res.status(400).json({ error: 'Invalid job id' });
    }
    const removed = await autoSourcingService.unwatch(req.tenant!.id, jobId);
    if (!removed) return res.status(404).json({ error: 'Job is not watched' });
    res.json({ ok: true, jobId });
  })
);

export default router;
