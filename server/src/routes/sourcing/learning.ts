import { Router, type Request } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireSourcingRead } from '../../services/sourcing/access.js';
import { handleSourcingError } from '../../services/sourcing/httpErrors.js';
import * as learning from '../../services/sourcing/learning/learningEngineService.js';

const router = Router();
const tid = (req: Request) => req.tenant!.id;

router.post(
  '/recompute/:sourceId',
  requireSourcingRead,
  asyncHandler(async (req, res) => {
    try {
      const sourceId = z.string().uuid().parse(req.params.sourceId);
      res.json(await learning.recompute(tid(req), sourceId));
    } catch (err) {
      handleSourcingError(res, err);
    }
  })
);

router.get(
  '/scores/:sourceId',
  requireSourcingRead,
  asyncHandler(async (req, res) => {
    try {
      const sourceId = z.string().uuid().parse(req.params.sourceId);
      res.json(await learning.getScores(tid(req), sourceId));
    } catch (err) {
      handleSourcingError(res, err);
    }
  })
);

export default router;
