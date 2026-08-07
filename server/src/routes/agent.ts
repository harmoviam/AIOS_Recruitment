import { Router, type Request } from 'express';
import { z } from 'zod';
import {
  agentContextFromRequest,
  ensureAgentToolsRegistered,
  listTools,
  runAgentChat,
} from '../agent/index.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireTenant, tenantMiddleware } from '../middleware/tenant.js';
import { aiMode } from '../services/ai.js';

const router = Router();
router.use(authMiddleware);
router.use(tenantMiddleware);
router.use(requireTenant);

ensureAgentToolsRegistered();

const chatSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  job_id: z.number().int().positive().optional(),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(8000),
      })
    )
    .max(20)
    .optional(),
});

/**
 * Phase 0 recruiting agent chat.
 * POST /api/agent/chat
 * Body: { message, job_id?, history? }
 */
router.post(
  '/chat',
  asyncHandler(async (req: Request, res) => {
    const body = chatSchema.parse(req.body);
    const ctx = agentContextFromRequest(req, { jobId: body.job_id ?? null });
    const result = await runAgentChat(ctx, {
      message: body.message,
      history: body.history,
    });

    const status = result.error && result.steps === 0 ? 503 : 200;
    res.status(status).json({
      reply: result.reply,
      tool_calls: result.toolCalls,
      pending_approvals: result.pendingApprovals,
      steps: result.steps,
      ai_mode: aiMode(),
      error: result.error ?? null,
    });
  })
);

/** List registered Phase 0 tools (debug / UI discovery). */
router.get(
  '/tools',
  asyncHandler(async (_req, res) => {
    ensureAgentToolsRegistered();
    res.json({
      ai_mode: aiMode(),
      tools: listTools().map((t) => ({
        name: t.name,
        description: t.description,
        gate: t.gate,
      })),
    });
  })
);

export default router;
