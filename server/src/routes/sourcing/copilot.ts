import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireSourcingRead } from '../../services/sourcing/access.js';
import { handleSourcingError } from '../../services/sourcing/httpErrors.js';
import { getConversationService } from '../../services/sourcing/providers.js';
import {
  CopilotPlanHttpError,
  runCopilotPlan,
  type CopilotPlanEvent,
} from '../../services/sourcing/copilotPlanService.js';
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

function writeSse(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function emitPlanSse(res: Response, event: CopilotPlanEvent) {
  if (event.type === 'status') {
    writeSse(res, 'status', { stage: event.stage });
  } else if (event.type === 'intent') {
    writeSse(res, 'intent', { intent: event.intent });
  } else if (event.type === 'recommendations') {
    writeSse(res, 'recommendations', { recommendations: event.recommendations });
  } else if (event.type === 'content') {
    writeSse(res, 'content', { content: event.content });
  } else if (event.type === 'done') {
    writeSse(res, 'done', { ok: true });
  }
}

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
      const result = await runCopilotPlan(body, { tenantId: tid(req), userId: req.user!.id }, () => {});
      res.json(result);
    } catch (err) {
      if (err instanceof CopilotPlanHttpError) {
        return res.status(err.status).json({ error: err.message, intent: err.intent });
      }
      handleSourcingError(res, err);
    }
  })
);

/** Brief pause so each SSE stage can paint before the next chunk (heuristics are otherwise instant). */
function paceStream(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 140));
}

/** Progressive plan: SSE events status → intent → recommendations → content → done */
router.post(
  '/plan/stream',
  requireSourcingRead,
  asyncHandler(async (req, res) => {
    let body: z.infer<typeof planSchema>;
    try {
      body = planSchema.parse(req.body);
    } catch (err) {
      return handleSourcingError(res, err);
    }

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') res.flushHeaders();

    try {
      await runCopilotPlan(body, { tenantId: tid(req), userId: req.user!.id }, async (event) => {
        emitPlanSse(res, event);
        if (event.type !== 'done') await paceStream();
      });
    } catch (err) {
      if (err instanceof CopilotPlanHttpError) {
        writeSse(res, 'error', {
          error: err.message,
          intent: err.intent,
          status: err.status,
        });
      } else if (err instanceof z.ZodError) {
        writeSse(res, 'error', { error: 'Validation Failed', status: 400 });
      } else {
        console.error('Copilot plan stream failed:', err);
        writeSse(res, 'error', {
          error: err instanceof Error ? err.message : 'Could not build a plan',
          status: 500,
        });
      }
    } finally {
      res.end();
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
