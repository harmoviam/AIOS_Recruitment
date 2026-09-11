/**
 * AI Talent Sourcing Agent — mounted at /api/ai-sourcing.
 * Distinct from /api/sourcing (channel Sourcing Copilot).
 */

import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.js';
import { requireTenant, tenantMiddleware } from '../../middleware/tenant.js';
import { isAiSourcingEnabled, requireAiSourcingEnabled } from '../../services/aiSourcing/featureFlag.js';
import { parseAutoRunConfig } from '../../services/aiSourcing/autoSourcingService.js';
import searchRouter from './search.js';
import jobsRouter from './jobs.js';
import candidatesRouter from './candidates.js';
import skillsRouter from './skills.js';
import autoRunsRouter from './autoRuns.js';

const router = Router();

router.get('/health', (_req, res) => {
  const autoRun = parseAutoRunConfig();
  res.json({
    status: 'ok',
    module: 'ai-sourcing',
    version: '1.3.0-auto-run',
    enabled: isAiSourcingEnabled(),
    tenantScoped: true,
    features: {
      jdIntelligence: true,
      candidateIntelligence: true,
      skillOntology: true,
      hybridSearch: true,
      explainableScore: true,
      autoRun: autoRun.enabled,
      semanticSearch: false,
    },
    autoRun: {
      enabled: autoRun.enabled,
      intervalMinutes: autoRun.intervalMinutes,
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
secured.use(autoRunsRouter);

router.use(secured);

export default router;
