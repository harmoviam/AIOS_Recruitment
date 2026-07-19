import { Router, type Request } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireSourcingRead } from '../../services/sourcing/access.js';
import { handleSourcingError } from '../../services/sourcing/httpErrors.js';
import {
  getConversationService,
  getContentGeneratorService,
  getRecommendationService,
} from '../../services/sourcing/providers.js';
import { pool } from '../../db.js';

const router = Router();
const tid = (req: Request) => req.tenant!.id;

const parseSchema = z.object({ text: z.string().trim().min(3).max(1000) });
const planSchema = z.object({
  text: z.string().trim().min(3).max(1000).optional(),
  cityId: z.string().uuid().optional(),
  roleId: z.string().uuid().optional(),
  hiringCount: z.number().int().positive().optional(),
  experienceLevelId: z.string().uuid().optional(),
  joiningTimelineDays: z.number().int().positive().optional(),
  salaryMin: z.number().optional(),
  salaryMax: z.number().optional(),
  shift: z.string().optional(),
  languages: z.array(z.string()).optional(),
  includeContent: z.boolean().optional(),
});

router.post(
  '/parse',
  requireSourcingRead,
  asyncHandler(async (req, res) => {
    try {
      const body = parseSchema.parse(req.body);
      const intent = await getConversationService().parse(
        { text: body.text },
        { tenantId: tid(req), userId: req.user!.id }
      );
      res.json(intent);
    } catch (err) {
      handleSourcingError(res, err);
    }
  })
);

router.post(
  '/plan',
  requireSourcingRead,
  asyncHandler(async (req, res) => {
    try {
      const body = planSchema.parse(req.body);
      let cityId = body.cityId;
      let roleId = body.roleId;
      let hiringCount = body.hiringCount;
      let intent = null;

      if (body.text) {
        intent = await getConversationService().parse(
          { text: body.text },
          { tenantId: tid(req), userId: req.user!.id }
        );
        cityId = cityId || intent.cityId;
        roleId = roleId || intent.roleId;
        hiringCount = hiringCount || intent.hiringCount;
      }

      if (!cityId || !roleId || !hiringCount) {
        return res.status(400).json({
          error: 'cityId, roleId, and hiringCount are required (confirm structured intent)',
          intent,
        });
      }

      const criteria = {
        cityId,
        roleId,
        hiringCount,
        experienceLevelId: body.experienceLevelId,
        joiningTimelineDays: body.joiningTimelineDays ?? intent?.joiningTimelineDays,
        salaryMin: body.salaryMin ?? intent?.salaryHint,
        salaryMax: body.salaryMax ?? intent?.salaryHint,
        shift: body.shift,
        languages: body.languages,
        limit: 20,
      };

      const recommendations = await getRecommendationService().recommend(criteria, {
        tenantId: tid(req),
        userId: req.user!.id,
      });

      let content = null;
      if (body.includeContent !== false) {
        const city = await pool.query(`SELECT name FROM sourcing_city WHERE id = $1 AND tenant_id = $2`, [
          cityId,
          tid(req),
        ]);
        const role = await pool.query(`SELECT name FROM sourcing_role WHERE id = $1 AND tenant_id = $2`, [
          roleId,
          tid(req),
        ]);
        content = await getContentGeneratorService().generate(
          {
            cityName: String(city.rows[0]?.name || intent?.cityName || ''),
            roleName: String(role.rows[0]?.name || intent?.roleName || ''),
            hiringCount,
            salaryMin: criteria.salaryMin,
            salaryMax: criteria.salaryMax,
            experienceLabel: intent?.experienceHint,
            shift: body.shift,
            languages: body.languages,
            sourceName: recommendations.recommendations[0]?.sourceName,
          },
          { tenantId: tid(req), userId: req.user!.id }
        );
      }

      res.json({ intent, recommendations, content });
    } catch (err) {
      handleSourcingError(res, err);
    }
  })
);

export default router;
