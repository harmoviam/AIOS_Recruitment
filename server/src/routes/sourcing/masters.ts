import { Router, type Request } from 'express';
import { z } from 'zod';
import {
  codeNameCreateSchema,
  codeNameUpdateSchema,
  experienceCreateSchema,
  experienceUpdateSchema,
  qualificationCreateSchema,
  qualificationUpdateSchema,
  roleCreateSchema,
  roleUpdateSchema,
  salaryRangeCreateSchema,
  salaryRangeUpdateSchema,
} from '../../dto/sourcing/masters.js';
import {
  industryRepo,
  recruitmentCategoryRepo,
  sourceCategoryRepo,
} from '../../repositories/sourcing/codeNameRepository.js';
import * as talent from '../../repositories/sourcing/talentRepository.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { actorLabel, requireSourcingRead, requireSourcingWrite } from '../../services/sourcing/access.js';
import { handleSourcingError } from '../../services/sourcing/httpErrors.js';
import { parseListQuery, toPageResult } from '../../services/sourcing/pagination.js';
import { createMasterRouter } from './masterCrud.js';

const router = Router();
const tid = (req: Request) => req.tenant!.id;
const idParam = z.string().uuid();

router.use(
  '/recruitment-categories',
  createMasterRouter({
    label: 'Recruitment category',
    createSchema: codeNameCreateSchema,
    updateSchema: codeNameUpdateSchema,
    list: (t, q) => recruitmentCategoryRepo.list(t, q),
    get: (t, id) => recruitmentCategoryRepo.getById(t, id),
    create: (t, body, by) =>
      recruitmentCategoryRepo.create(t, body as { code: string; name: string }, by),
    update: (t, id, body) => recruitmentCategoryRepo.update(t, id, body as { code?: string; name?: string }),
  })
);

router.use(
  '/industries',
  createMasterRouter({
    label: 'Industry',
    createSchema: codeNameCreateSchema,
    updateSchema: codeNameUpdateSchema,
    list: (t, q) => industryRepo.list(t, q),
    get: (t, id) => industryRepo.getById(t, id),
    create: (t, body, by) => industryRepo.create(t, body as { code: string; name: string }, by),
    update: (t, id, body) => industryRepo.update(t, id, body as { code?: string; name?: string }),
  })
);

router.use(
  '/source-categories',
  createMasterRouter({
    label: 'Source category',
    createSchema: codeNameCreateSchema,
    updateSchema: codeNameUpdateSchema,
    list: (t, q) => sourceCategoryRepo.list(t, q),
    get: (t, id) => sourceCategoryRepo.getById(t, id),
    create: (t, body, by) => sourceCategoryRepo.create(t, body as { code: string; name: string }, by),
    update: (t, id, body) => sourceCategoryRepo.update(t, id, body as { code?: string; name?: string }),
  })
);

router.use(
  '/qualifications',
  createMasterRouter({
    label: 'Qualification',
    createSchema: qualificationCreateSchema,
    updateSchema: qualificationUpdateSchema,
    list: (t, q) => talent.listQualifications(t, q),
    get: (t, id) => talent.getQualification(t, id),
    create: (t, body, by) => talent.createQualification(t, body as never, by),
    update: (t, id, body) => talent.updateQualification(t, id, body as never),
  })
);

router.use(
  '/experience-levels',
  createMasterRouter({
    label: 'Experience level',
    createSchema: experienceCreateSchema,
    updateSchema: experienceUpdateSchema,
    list: (t, q) => talent.listExperienceLevels(t, q),
    get: (t, id) => talent.getExperienceLevel(t, id),
    create: (t, body, by) => talent.createExperienceLevel(t, body as never, by),
    update: (t, id, body) => talent.updateExperienceLevel(t, id, body as never),
  })
);

router.use(
  '/salary-ranges',
  createMasterRouter({
    label: 'Salary range',
    createSchema: salaryRangeCreateSchema,
    updateSchema: salaryRangeUpdateSchema,
    list: (t, q) => talent.listSalaryRanges(t, q),
    get: (t, id) => talent.getSalaryRange(t, id),
    create: (t, body, by) => talent.createSalaryRange(t, body as never, by),
    update: (t, id, body) => talent.updateSalaryRange(t, id, body as never),
  })
);

const rolesRouter = Router();
rolesRouter.get(
  '/',
  requireSourcingRead,
  asyncHandler(async (req, res) => {
    try {
      const query = parseListQuery(req.query);
      const industryId =
        typeof req.query.industryId === 'string' && req.query.industryId
          ? idParam.parse(req.query.industryId)
          : undefined;
      const categoryId =
        typeof req.query.categoryId === 'string' && req.query.categoryId
          ? idParam.parse(req.query.categoryId)
          : undefined;
      const { items, total } = await talent.listRoles(tid(req), query, { industryId, categoryId });
      res.json(toPageResult(items, total, query));
    } catch (err) {
      handleSourcingError(res, err);
    }
  })
);
rolesRouter.get(
  '/:id',
  requireSourcingRead,
  asyncHandler(async (req, res) => {
    try {
      const row = await talent.getRole(tid(req), idParam.parse(req.params.id));
      if (!row) return res.status(404).json({ error: 'Role not found' });
      res.json(row);
    } catch (err) {
      handleSourcingError(res, err);
    }
  })
);
rolesRouter.post(
  '/',
  requireSourcingWrite,
  asyncHandler(async (req, res) => {
    try {
      const body = roleCreateSchema.parse(req.body);
      res.status(201).json(await talent.createRole(tid(req), body, actorLabel(req)));
    } catch (err) {
      handleSourcingError(res, err);
    }
  })
);
rolesRouter.put(
  '/:id',
  requireSourcingWrite,
  asyncHandler(async (req, res) => {
    try {
      const body = roleUpdateSchema.parse(req.body);
      const row = await talent.updateRole(tid(req), idParam.parse(req.params.id), body);
      if (!row) return res.status(404).json({ error: 'Role not found' });
      res.json(row);
    } catch (err) {
      handleSourcingError(res, err);
    }
  })
);
rolesRouter.patch(
  '/:id',
  requireSourcingWrite,
  asyncHandler(async (req, res) => {
    try {
      const body = roleUpdateSchema.parse(req.body);
      const row = await talent.updateRole(tid(req), idParam.parse(req.params.id), body);
      if (!row) return res.status(404).json({ error: 'Role not found' });
      res.json(row);
    } catch (err) {
      handleSourcingError(res, err);
    }
  })
);

router.use('/roles', rolesRouter);

export default router;
