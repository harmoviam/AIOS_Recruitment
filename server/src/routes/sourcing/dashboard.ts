import { Router, type Request } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireSourcingRead } from '../../services/sourcing/access.js';
import { handleSourcingError } from '../../services/sourcing/httpErrors.js';
import * as analytics from '../../services/sourcing/analytics/dashboardAnalyticsService.js';

const router = Router();
const tid = (req: Request) => req.tenant!.id;

router.get(
  '/summary',
  requireSourcingRead,
  asyncHandler(async (req, res) => {
    try {
      res.json(await analytics.getDashboardSummary(tid(req)));
    } catch (err) {
      handleSourcingError(res, err);
    }
  })
);

router.get(
  '/charts/source-performance',
  requireSourcingRead,
  asyncHandler(async (req, res) => {
    try {
      res.json(await analytics.getSourcePerformanceChart(tid(req)));
    } catch (err) {
      handleSourcingError(res, err);
    }
  })
);

router.get(
  '/charts/city-distribution',
  requireSourcingRead,
  asyncHandler(async (req, res) => {
    try {
      res.json(await analytics.getCityDistributionChart(tid(req)));
    } catch (err) {
      handleSourcingError(res, err);
    }
  })
);

router.get(
  '/charts/role-distribution',
  requireSourcingRead,
  asyncHandler(async (req, res) => {
    try {
      res.json(await analytics.getRoleDistributionChart(tid(req)));
    } catch (err) {
      handleSourcingError(res, err);
    }
  })
);

router.get(
  '/charts/campaign-performance',
  requireSourcingRead,
  asyncHandler(async (req, res) => {
    try {
      res.json(await analytics.getCampaignPerformanceChart(tid(req)));
    } catch (err) {
      handleSourcingError(res, err);
    }
  })
);

export default router;
