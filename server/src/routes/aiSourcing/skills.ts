import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import {
  requireAiSourcingSearch,
  requireAiSourcingView,
} from '../../services/aiSourcing/access.js';
import { skillOntologyService } from '../../services/aiSourcing/skillOntologyService.js';

const router = Router();

router.get(
  '/skills',
  requireAiSourcingView,
  asyncHandler(async (req, res) => {
    const limit = Number(req.query.limit) || 100;
    const items = await skillOntologyService.listSkills(limit);
    res.json({ items });
  })
);

const normalizeSchema = z.object({
  skills: z.array(z.string().trim().min(1).max(64)).min(1).max(40),
});

router.post(
  '/skills/normalize',
  requireAiSourcingSearch,
  asyncHandler(async (req, res) => {
    const body = normalizeSchema.parse(req.body);
    const expansions = [];
    for (const skill of body.skills) {
      expansions.push(await skillOntologyService.expandSkill(skill));
    }
    res.json({
      normalized: skillOntologyService.normalizeMany(body.skills),
      expanded: await skillOntologyService.expandSkills(body.skills),
      expansions,
    });
  })
);

export default router;
