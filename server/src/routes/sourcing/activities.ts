import { Router, type Request } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { pool } from '../../db.js';
import { actorLabel, requireSourcingRead, requireSourcingWrite } from '../../services/sourcing/access.js';
import { handleSourcingError } from '../../services/sourcing/httpErrors.js';
import { parseListQuery, toPageResult } from '../../services/sourcing/pagination.js';
import * as learning from '../../services/sourcing/learning/learningEngineService.js';

const router = Router();
const tid = (req: Request) => req.tenant!.id;

const activitySchema = z.object({
  sourceId: z.string().uuid(),
  campaignId: z.string().uuid().optional().nullable(),
  cityId: z.string().uuid().optional().nullable(),
  roleId: z.string().uuid().optional().nullable(),
  activityDate: z.string().date().optional(),
  applications: z.number().int().nonnegative().optional(),
  interviews: z.number().int().nonnegative().optional(),
  offers: z.number().int().nonnegative().optional(),
  joinings: z.number().int().nonnegative().optional(),
  noShows: z.number().int().nonnegative().optional(),
  offerDrops: z.number().int().nonnegative().optional(),
  notes: z.string().optional().nullable(),
});

router.get(
  '/',
  requireSourcingRead,
  asyncHandler(async (req, res) => {
    try {
      const query = parseListQuery(req.query);
      const params: unknown[] = [tid(req)];
      let where = 'WHERE tenant_id = $1';
      if (typeof req.query.sourceId === 'string') {
        params.push(req.query.sourceId);
        where += ` AND source_id = $${params.length}`;
      }
      const countRes = await pool.query(
        `SELECT COUNT(*)::int AS c FROM sourcing_recruiter_activity ${where}`,
        params
      );
      const limit = query.pageSize;
      const offset = (query.page - 1) * query.pageSize;
      const listParams = [...params, limit, offset];
      const { rows } = await pool.query(
        `SELECT * FROM sourcing_recruiter_activity ${where}
         ORDER BY created_date DESC LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
        listParams
      );
      res.json(
        toPageResult(
          rows.map((r) => ({
            id: String(r.id),
            sourceId: String(r.source_id),
            campaignId: r.campaign_id != null ? String(r.campaign_id) : null,
            applications: Number(r.applications),
            interviews: Number(r.interviews),
            offers: Number(r.offers),
            joinings: Number(r.joinings),
            noShows: Number(r.no_shows),
            offerDrops: Number(r.offer_drops),
            activityDate: String(r.activity_date).slice(0, 10),
          })),
          countRes.rows[0].c,
          query
        )
      );
    } catch (err) {
      handleSourcingError(res, err);
    }
  })
);

router.post(
  '/',
  requireSourcingWrite,
  asyncHandler(async (req, res) => {
    try {
      const body = activitySchema.parse(req.body);
      const row = await learning.recordActivity(tid(req), req.user!.id, body, actorLabel(req));
      res.status(201).json(row);
    } catch (err) {
      handleSourcingError(res, err);
    }
  })
);

export default router;
