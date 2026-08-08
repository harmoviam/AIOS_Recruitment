/**
 * AI Talent Sourcing Agent — mounted at /api/ai-sourcing.
 * Distinct from /api/sourcing (channel Sourcing Copilot).
 */

import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.js';
import { requireTenant, tenantMiddleware } from '../../middleware/tenant.js';
import { isAiSourcingEnabled, requireAiSourcingEnabled } from '../../services/aiSourcing/featureFlag.js';
import searchRouter from './search.js';
import jobsRouter from './jobs.js';
import candidatesRouter from './candidates.js';
import skillsRouter from './skills.js';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    module: 'ai-sourcing',
    version: '1.1.0-sprint2',
    enabled: isAiSourcingEnabled(),
    tenantScoped: true,
    features: {
      jdIntelligence: true,
      candidateIntelligence: true,
      skillOntology: true,
      hybridSearch: true,
      semanticSearch: false,
    },
  });
});

const secured = Router();
secured.use(authMiddleware);
secured.use(tenantMiddleware);
secured.use(requireTenant);
secured.use(requireAiSourcingEnabled);
secured.use(searchRouter);
secured.use(jobsRouter);
secured.use(candidatesRouter);
secured.use(skillsRouter);

router.use(secured);

export default router;
