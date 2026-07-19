import { Router, type Request } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { sourceCreateSchema, sourceUpdateSchema, CHANNEL_TYPES } from '../../dto/sourcing/masters.js';
import { statusPatchSchema } from '../../dto/sourcing/geo.js';
import * as sourceRepo from '../../repositories/sourcing/sourceRepository.js';
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
      const channelType =
        typeof req.query.channelType === 'string' &&
        (CHANNEL_TYPES as readonly string[]).includes(req.query.channelType)
          ? req.query.channelType
          : undefined;
      const { items, total } = await sourceRepo.listSources(tid(req), query, {
        cityId: typeof req.query.cityId === 'string' ? idParam.parse(req.query.cityId) : undefined,
        categoryId:
          typeof req.query.categoryId === 'string' ? idParam.parse(req.query.categoryId) : undefined,
        channelType,
        roleId: typeof req.query.roleId === 'string' ? idParam.parse(req.query.roleId) : undefined,
      });
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
      const row = await sourceRepo.getSourceById(tid(req), idParam.parse(req.params.id));
      if (!row) return res.status(404).json({ error: 'Source not found' });
      res.json(row);
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
      const body = sourceCreateSchema.parse(req.body);
      res.status(201).json(await sourceRepo.createSource(tid(req), body, actorLabel(req)));
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
      const body = sourceUpdateSchema.parse(req.body);
      const row = await sourceRepo.updateSource(tid(req), idParam.parse(req.params.id), body, actorLabel(req));
      if (!row) return res.status(404).json({ error: 'Source not found' });
      res.json(row);
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
      const body = sourceUpdateSchema.parse(req.body);
      const row = await sourceRepo.updateSource(tid(req), idParam.parse(req.params.id), body, actorLabel(req));
      if (!row) return res.status(404).json({ error: 'Source not found' });
      res.json(row);
    } catch (err) {
      handleSourcingError(res, err);
    }
  })
);

router.patch(
  '/:id/status',
  requireSourcingWrite,
  asyncHandler(async (req, res) => {
    try {
      const body = statusPatchSchema.parse(req.body);
      const row = await sourceRepo.updateSource(tid(req), idParam.parse(req.params.id), body, actorLabel(req));
      if (!row) return res.status(404).json({ error: 'Source not found' });
      res.json(row);
    } catch (err) {
      handleSourcingError(res, err);
    }
  })
);

router.post(
  '/:id/verify',
  requireSourcingWrite,
  asyncHandler(async (req, res) => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const row = await sourceRepo.updateSource(
        tid(req),
        idParam.parse(req.params.id),
        { lastVerified: today },
        actorLabel(req)
      );
      if (!row) return res.status(404).json({ error: 'Source not found' });
      res.json(row);
    } catch (err) {
      handleSourcingError(res, err);
    }
  })
);

export default router;
