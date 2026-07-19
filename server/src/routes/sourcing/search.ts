import { Router, type Request } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { pool } from '../../db.js';
import { requireSourcingRead } from '../../services/sourcing/access.js';
import { handleSourcingError } from '../../services/sourcing/httpErrors.js';
import { getRecommendationService } from '../../services/sourcing/providers.js';

const router = Router();
const tid = (req: Request) => req.tenant!.id;

const searchSchema = z.object({
  cityId: z.string().uuid(),
  roleId: z.string().uuid(),
  experienceLevelId: z.string().uuid().optional(),
  qualificationId: z.string().uuid().optional(),
  hiringCount: z.number().int().positive(),
  joiningTimelineDays: z.number().int().positive().optional(),
  genderPreference: z.string().optional(),
  salaryMin: z.number().optional(),
  salaryMax: z.number().optional(),
  shift: z.string().optional(),
  languages: z.array(z.string()).optional(),
  limit: z.number().int().min(1).max(20).optional(),
});

router.post(
  '/search',
  requireSourcingRead,
  asyncHandler(async (req, res) => {
    try {
      const criteria = searchSchema.parse(req.body);
      const result = await getRecommendationService().recommend(criteria, {
        tenantId: tid(req),
        userId: req.user!.id,
      });
      res.json(result);
    } catch (err) {
      handleSourcingError(res, err);
    }
  })
);

router.post(
  '/estimate',
  requireSourcingRead,
  asyncHandler(async (req, res) => {
    try {
      const criteria = searchSchema.parse(req.body);
      const result = await getRecommendationService().recommend(
        { ...criteria, limit: 5 },
        { tenantId: tid(req), userId: req.user!.id }
      );
      res.json(result.planSummary);
    } catch (err) {
      handleSourcingError(res, err);
    }
  })
);

router.get(
  '/recommendations/:runId',
  requireSourcingRead,
  asyncHandler(async (req, res) => {
    try {
      const runId = z.string().uuid().parse(req.params.runId);
      const { rows } = await pool.query(
        `SELECT id, result_json, provider, created_date FROM recommendation_run
         WHERE tenant_id = $1 AND id = $2`,
        [tid(req), runId]
      );
      if (!rows[0]) return res.status(404).json({ error: 'Recommendation run not found' });
      res.json({
        runId: String(rows[0].id),
        provider: String(rows[0].provider),
        createdDate: new Date(String(rows[0].created_date)).toISOString(),
        ...rows[0].result_json,
      });
    } catch (err) {
      handleSourcingError(res, err);
    }
  })
);

export default router;
