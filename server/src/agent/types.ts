import type { z } from 'zod';
import type OpenAI from 'openai';
import type { AgentContext } from './context.js';

/** auto = run immediately; confirm = return pending_approval (Phase 1+); admin = restricted. */
export type ToolGate = 'auto' | 'confirm' | 'admin';

export interface AgentToolDefinition<TSchema extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  gate: ToolGate;
  /** Zod schema for arguments (validated before handler runs). */
  schema: TSchema;
  /** OpenAI function-parameters JSON Schema (hand-authored; keep in sync with Zod). */
  parameters: Record<string, unknown>;
  handler: (ctx: AgentContext, args: z.infer<TSchema>) => Promise<unknown>;
}

export interface ToolCallRecord {
  name: string;
  arguments: unknown;
  gate: ToolGate;
  ok: boolean;
  durationMs: number;
  error?: string;
}

export interface PendingApproval {
  tool: string;
  arguments: unknown;
  reason: string;
}

export interface AgentRunResult {
  reply: string;
  toolCalls: ToolCallRecord[];
  pendingApprovals: PendingApproval[];
  steps: number;
  error?: string;
}

export type ChatTool = OpenAI.Chat.ChatCompletionTool;
