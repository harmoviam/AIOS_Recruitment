import { Router, type Request } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import {
  countryCreateSchema,
  countryUpdateSchema,
  statusPatchSchema,
} from '../../dto/sourcing/geo.js';
import { actorLabel, requireSourcingRead, requireSourcingWrite } from '../../services/sourcing/access.js';
import { handleSourcingError } from '../../services/sourcing/httpErrors.js';
import * as geoService from '../../services/sourcing/masters/geoService.js';
import { parseListQuery } from '../../services/sourcing/pagination.js';

const router = Router();
const tid = (req: Request) => req.tenant!.id;
const idParam = z.string().uuid();

router.get(
  '/',
  requireSourcingRead,
  asyncHandler(async (req, res) => {
    try {
      const query = parseListQuery(req.query);
      res.json(await geoService.listCountries(tid(req), query));
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
      const id = idParam.parse(req.params.id);
      const row = await geoService.getCountry(tid(req), id);
      if (!row) return res.status(404).json({ error: 'Country not found' });
      res.json(row);
    } catch (err) {
      handleSourcingError(res, err);
    }
  })
);

router.get(
  '/:id/states',
  requireSourcingRead,
  asyncHandler(async (req, res) => {
    try {
      const id = idParam.parse(req.params.id);
      const query = parseListQuery(req.query);
      res.json(await geoService.listStates(tid(req), query, id));
    } catch (err) {
      if ((err as { code?: string }).code === 'COUNTRY_NOT_FOUND') {
        return res.status(404).json({ error: 'Country not found' });
      }
      handleSourcingError(res, err);
    }
  })
);

router.post(
  '/',
  requireSourcingWrite,
  asyncHandler(async (req, res) => {
    try {
      const body = countryCreateSchema.parse(req.body);
      const row = await geoService.createCountry(tid(req), body, actorLabel(req));
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
      const body = countryUpdateSchema.parse(req.body);
      const row = await geoService.updateCountry(tid(req), id, body);
      if (!row) return res.status(404).json({ error: 'Country not found' });
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
      const id = idParam.parse(req.params.id);
      const body = countryUpdateSchema.parse(req.body);
      const row = await geoService.updateCountry(tid(req), id, body);
      if (!row) return res.status(404).json({ error: 'Country not found' });
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
      const id = idParam.parse(req.params.id);
      const body = statusPatchSchema.parse(req.body);
      const row = await geoService.updateCountry(tid(req), id, body);
      if (!row) return res.status(404).json({ error: 'Country not found' });
      res.json(row);
    } catch (err) {
      handleSourcingError(res, err);
    }
  })
);

export default router;
