import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import {
  requireAiSourcingSearch,
  requireAiSourcingView,
} from '../../services/aiSourcing/access.js';
import { candidateIntelligenceService } from '../../services/aiSourcing/candidateIntelligenceService.js';

const router = Router();

function parseCandidateId(raw: string): number | null {
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

router.post(
  '/candidates/:candidateId/intelligence',
  requireAiSourcingSearch,
  asyncHandler(async (req, res) => {
    const candidateId = parseCandidateId(String(req.params.candidateId || ''));
    if (!candidateId) return res.status(400).json({ error: 'Invalid candidate id' });
    try {
      const result = await candidateIntelligenceService.analyze(req, candidateId);
      res.json(result);
    } catch (err) {
      const e = err as { status?: number; message?: string };
      if (e.status === 404) return res.status(404).json({ error: e.message || 'Candidate not found' });
      throw err;
    }
  })
);

router.get(
  '/candidates/:candidateId/intelligence',
  requireAiSourcingView,
  asyncHandler(async (req, res) => {
    const candidateId = parseCandidateId(String(req.params.candidateId || ''));
    if (!candidateId) return res.status(400).json({ error: 'Invalid candidate id' });
    try {
      const result = await candidateIntelligenceService.get(req, candidateId);
      if (!result) {
        return res.status(404).json({ error: 'Candidate intelligence not found — run analyze first' });
      }
      res.json(result);
    } catch (err) {
      const e = err as { status?: number; message?: string };
      if (e.status === 404) return res.status(404).json({ error: e.message || 'Candidate not found' });
      throw err;
    }
  })
);

export default router;
