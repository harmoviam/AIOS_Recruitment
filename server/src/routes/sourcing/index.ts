/**
 * AI Sourcing Intelligence routes — mounted at /api/sourcing.
 */

import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.js';
import { requireTenant, tenantMiddleware } from '../../middleware/tenant.js';
import type { SourcingHealthResponse } from '../../dto/sourcing/index.js';
import countriesRouter from './countries.js';
import statesRouter from './states.js';
import citiesRouter from './cities.js';
import mastersRouter from './masters.js';
import sourcesRouter from './sources.js';
import campaignsRouter from './campaigns.js';
import searchRouter from './search.js';
import copilotRouter from './copilot.js';
import contentRouter from './content.js';
import activitiesRouter from './activities.js';
import learningRouter from './learning.js';
import dashboardRouter from './dashboard.js';

const router = Router();

router.get('/health', (_req, res) => {
  const body: SourcingHealthResponse = {
    status: 'ok',
    module: 'sourcing',
    version: '1.0.0-sprint3-11',
    tenantScoped: true,
  };
  res.json(body);
});

const secured = Router();
secured.use(authMiddleware);
secured.use(tenantMiddleware);
secured.use(requireTenant);

secured.use('/countries', countriesRouter);
secured.use('/states', statesRouter);
secured.use('/cities', citiesRouter);
secured.use(mastersRouter);
secured.use('/sources', sourcesRouter);
secured.use('/campaigns', campaignsRouter);
secured.use(searchRouter);
secured.use('/copilot', copilotRouter);
secured.use('/content', contentRouter);
secured.use('/activities', activitiesRouter);
secured.use('/learning', learningRouter);
secured.use('/dashboard', dashboardRouter);

router.use(secured);

export default router;
