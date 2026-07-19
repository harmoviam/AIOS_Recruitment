import { Router, type Request } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireSourcingRead } from '../../services/sourcing/access.js';
import { handleSourcingError } from '../../services/sourcing/httpErrors.js';
import { getContentGeneratorService } from '../../services/sourcing/providers.js';

const router = Router();

const schema = z.object({
  cityName: z.string().min(1),
  roleName: z.string().min(1),
  hiringCount: z.number().int().positive(),
  salaryMin: z.number().optional(),
  salaryMax: z.number().optional(),
  sourceName: z.string().optional(),
  experienceLabel: z.string().optional(),
  shift: z.string().optional(),
  languages: z.array(z.string()).optional(),
  variantCount: z.number().int().min(1).max(5).optional(),
});

router.post(
  '/generate',
  requireSourcingRead,
  asyncHandler(async (req, res) => {
    try {
      const body = schema.parse(req.body);
      const pack = await getContentGeneratorService().generate(body, {
        tenantId: req.tenant!.id,
        userId: req.user!.id,
      });
      res.json(pack);
    } catch (err) {
      handleSourcingError(res, err);
    }
  })
);

export default router;
