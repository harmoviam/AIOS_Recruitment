import { Router, type Request } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { statusPatchSchema } from '../../dto/sourcing/geo.js';
import { actorLabel, requireSourcingRead, requireSourcingWrite } from '../../services/sourcing/access.js';
import { handleSourcingError } from '../../services/sourcing/httpErrors.js';
import { parseListQuery, toPageResult } from '../../services/sourcing/pagination.js';

const idParam = z.string().uuid();
const tid = (req: Request) => req.tenant!.id;

type ListFn = (tenantId: number, query: ReturnType<typeof parseListQuery>) => Promise<{ items: unknown[]; total: number }>;
type GetFn = (tenantId: number, id: string) => Promise<unknown | null>;
type CreateFn = (tenantId: number, body: unknown, createdBy: string) => Promise<unknown>;
type UpdateFn = (tenantId: number, id: string, body: unknown) => Promise<unknown | null>;

export function createMasterRouter(opts: {
  label: string;
  createSchema: z.ZodTypeAny;
  updateSchema: z.ZodTypeAny;
  list: ListFn;
  get: GetFn;
  create: CreateFn;
  update: UpdateFn;
}) {
  const router = Router();

  router.get(
    '/',
    requireSourcingRead,
    asyncHandler(async (req, res) => {
      try {
        const query = parseListQuery(req.query);
        const { items, total } = await opts.list(tid(req), query);
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
        const id = idParam.parse(req.params.id);
        const row = await opts.get(tid(req), id);
        if (!row) return res.status(404).json({ error: `${opts.label} not found` });
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
        const body = opts.createSchema.parse(req.body);
        const row = await opts.create(tid(req), body, actorLabel(req));
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
        const body = opts.updateSchema.parse(req.body);
        const row = await opts.update(tid(req), id, body);
        if (!row) return res.status(404).json({ error: `${opts.label} not found` });
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
        const body = opts.updateSchema.parse(req.body);
        const row = await opts.update(tid(req), id, body);
        if (!row) return res.status(404).json({ error: `${opts.label} not found` });
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
        const row = await opts.update(tid(req), id, body);
        if (!row) return res.status(404).json({ error: `${opts.label} not found` });
        res.json(row);
      } catch (err) {
        handleSourcingError(res, err);
      }
    })
  );

  return router;
}
