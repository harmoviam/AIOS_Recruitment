/**
 * AI Talent Sourcing Agent — mounted at /api/ai-sourcing.
 * Distinct from /api/sourcing (channel Sourcing Copilot).
 */

import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.js';
import { requireTenant, tenantMiddleware } from '../../middleware/tenant.js';
import { isAiSourcingEnabled, requireAiSourcingEnabled } from '../../services/aiSourcing/featureFlag.js';
import searchRouter from './search.js';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    module: 'ai-sourcing',
    version: '1.0.0-sprint1',
    enabled: isAiSourcingEnabled(),
    tenantScoped: true,
  });
});

const secured = Router();
secured.use(authMiddleware);
secured.use(tenantMiddleware);
secured.use(requireTenant);
secured.use(requireAiSourcingEnabled);
secured.use(searchRouter);

router.use(secured);

export default router;
