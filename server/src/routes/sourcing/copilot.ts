import { Router, type Request } from 'express';
import { z } from 'zod';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireSourcingRead } from '../../services/sourcing/access.js';
import { handleSourcingError } from '../../services/sourcing/httpErrors.js';
import {
  getConversationService,
  getContentGeneratorService,
  getRecommendationService,
} from '../../services/sourcing/providers.js';
import { pool } from '../../db.js';
import { extractPeopleSearchFilters } from '../../services/ai.js';
import { filtersFromIntent, mergeFilters } from '../../services/sourcing/people/filtersFromIntent.js';
import { searchPeople } from '../../services/sourcing/people/peopleSearchService.js';

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

// Each live PDL profile costs a credit — keep the endpoint rate-limited per user.
const peopleLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const userId = (req as Request).user?.id;
    return userId != null ? String(userId) : ipKeyGenerator(req.ip ?? '');
  },
  message: { error: 'Too many people searches. Wait a minute and try again.' },
});

const peopleFiltersSchema = z.object({
  jobTitle: z.string().max(160).optional(),
  skills: z.array(z.string().min(1).max(60)).max(20).optional(),
  seniorityLevels: z.array(z.string().max(20)).max(6).optional(),
  minExperienceYears: z.number().min(0).max(50).optional(),
  maxExperienceYears: z.number().min(0).max(60).optional(),
  city: z.string().max(120).optional(),
  region: z.string().max(120).optional(),
  country: z.string().max(120).optional(),
  size: z.number().int().min(1).max(25).optional(),
});

const peopleSchema = z
  .object({
    text: z.string().trim().min(3).max(1000).optional(),
    filters: peopleFiltersSchema.optional(),
  })
  .refine((body) => body.text || body.filters, { message: 'text or filters required' });

router.post(
  '/people',
  requireSourcingRead,
  peopleLimiter,
  asyncHandler(async (req, res) => {
    try {
      const body = peopleSchema.parse(req.body);
      const context = { tenantId: tid(req), userId: req.user!.id };

      let intent = null;
      let heuristic = {};
      let llmExtracted = null;
      if (body.text) {
        intent = await getConversationService().parse({ text: body.text }, context);
        heuristic = filtersFromIntent(intent, body.text);
        llmExtracted = await extractPeopleSearchFilters(body.text);
      }

      // Explicit filters from the client override everything extracted.
      const filters = mergeFilters(heuristic, llmExtracted, body.filters);
      const result = await searchPeople(filters, body.text ?? null, context);
      res.json({ intent, result });
    } catch (err) {
      handleSourcingError(res, err);
    }
  })
);

router.get(
  '/people/runs',
  requireSourcingRead,
  asyncHandler(async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT id, prompt_text, result_count, provider, credits_used, created_date
           FROM people_search_run
          WHERE tenant_id = $1 AND status = 'ACTIVE'
          ORDER BY created_date DESC
          LIMIT 20`,
        [tid(req)]
      );
      res.json(rows);
    } catch (err) {
      handleSourcingError(res, err);
    }
  })
);

router.get(
  '/people/runs/:runId',
  requireSourcingRead,
  asyncHandler(async (req, res) => {
    try {
      const runId = z.string().uuid().parse(req.params.runId);
      const { rows } = await pool.query(
        `SELECT id, prompt_text, result_json, created_date
           FROM people_search_run
          WHERE id = $1 AND tenant_id = $2`,
        [runId, tid(req)]
      );
      if (!rows.length) return res.status(404).json({ error: 'People search run not found' });
      const row = rows[0];
      res.json({
        runId: String(row.id),
        promptText: row.prompt_text,
        createdDate: row.created_date,
        ...row.result_json,
      });
    } catch (err) {
      handleSourcingError(res, err);
    }
  })
);

export default router;
