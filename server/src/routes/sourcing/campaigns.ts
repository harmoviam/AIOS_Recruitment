import { Router, type Request } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import {
  campaignCreateSchema,
  campaignSourceAttachSchema,
  campaignUpdateSchema,
} from '../../dto/sourcing/masters.js';
import * as campaignRepo from '../../repositories/sourcing/campaignRepository.js';
import { actorLabel, requireSourcingRead, requireSourcingWrite } from '../../services/sourcing/access.js';
import { handleSourcingError } from '../../services/sourcing/httpErrors.js';
import { parseListQuery, toPageResult } from '../../services/sourcing/pagination.js';

const router = Router();
const tid = (req: Request) => req.tenant!.id;
const idParam = z.string().uuid();

router.get(
  '/',
  requireSourcingRead,
  asyncHandler(async (req, res) => {
    try {
      const query = parseListQuery(req.query);
      const mine = req.query.mine === 'true';
      const { items, total } = await campaignRepo.listCampaigns(
        tid(req),
        query,
        mine ? req.user!.id : undefined
      );
      res.json(toPageResult(items, total, query));
    } catch (err) {
      handleSourcingError(res, err);
    }
  })
);

router.get(
  '/:id',
  requireSourcingRead,
  asyncHandler(async (req, res) => {
    try {
      const row = await campaignRepo.getCampaignById(tid(req), idParam.parse(req.params.id));
      if (!row) return res.status(404).json({ error: 'Campaign not found' });
      res.json(row);
    } catch (err) {
      handleSourcingError(res, err);
    }
  })
);

router.get(
  '/:id/checklist',
  requireSourcingRead,
  asyncHandler(async (req, res) => {
    try {
      const row = await campaignRepo.getCampaignById(tid(req), idParam.parse(req.params.id));
      if (!row) return res.status(404).json({ error: 'Campaign not found' });
      res.json({
        campaignId: row.id,
        items: [
          { step: 1, action: 'Confirm Top sources and priorities', done: row.sources.length > 0 },
          { step: 2, action: 'Generate channel content (FB/WA/LI)', done: false },
          { step: 3, action: 'Post / share on P1–P3 sources', done: false },
          { step: 4, action: 'Start calling script for warm leads', done: false },
          { step: 5, action: 'Log applications and interview outcomes', done: false },
          { step: 6, action: 'Follow up no-shows and offer drops', done: false },
        ],
      });
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
      const body = campaignCreateSchema.parse(req.body);
      const row = await campaignRepo.createCampaign(tid(req), req.user!.id, body, actorLabel(req));
      res.status(201).json(row);
    } catch (err) {
      handleSourcingError(res, err);
    }
  })
);

router.put(
  '/:id',
  requireSourcingWrite,
  asyncHandler(async (req, res) => {
    try {
      const id = idParam.parse(req.params.id);
      const existing = await campaignRepo.getCampaignById(tid(req), id);
      if (!existing) return res.status(404).json({ error: 'Campaign not found' });
      const body = campaignUpdateSchema.parse(req.body);
      res.json(await campaignRepo.updateCampaign(tid(req), id, body));
    } catch (err) {
      handleSourcingError(res, err);
    }
  })
);

router.patch(
  '/:id',
  requireSourcingWrite,
  asyncHandler(async (req, res) => {
    try {
      const id = idParam.parse(req.params.id);
      const existing = await campaignRepo.getCampaignById(tid(req), id);
      if (!existing) return res.status(404).json({ error: 'Campaign not found' });
      const body = campaignUpdateSchema.parse(req.body);
      res.json(await campaignRepo.updateCampaign(tid(req), id, body));
    } catch (err) {
      handleSourcingError(res, err);
    }
  })
);

router.post(
  '/:id/sources',
  requireSourcingWrite,
  asyncHandler(async (req, res) => {
    try {
      const id = idParam.parse(req.params.id);
      const existing = await campaignRepo.getCampaignById(tid(req), id);
      if (!existing) return res.status(404).json({ error: 'Campaign not found' });
      const body = campaignSourceAttachSchema.parse(req.body);
      res.json(await campaignRepo.attachCampaignSource(tid(req), id, body, actorLabel(req)));
    } catch (err) {
      handleSourcingError(res, err);
    }
  })
);

router.delete(
  '/:id/sources/:sourceId',
  requireSourcingWrite,
  asyncHandler(async (req, res) => {
    try {
      const ok = await campaignRepo.detachCampaignSource(
        tid(req),
        idParam.parse(req.params.id),
        idParam.parse(req.params.sourceId)
      );
      if (!ok) return res.status(404).json({ error: 'Campaign source not found' });
      res.json({ ok: true });
    } catch (err) {
      handleSourcingError(res, err);
    }
  })
);

export default router;
