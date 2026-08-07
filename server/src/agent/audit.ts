import { pool } from '../db.js';
import type { AgentContext } from './context.js';
import type { ToolCallRecord } from './types.js';

/**
 * Best-effort audit of agent tool use.
 * Writes a single activities row summarizing the run (not one row per tool).
 */
export async function auditAgentRun(
  ctx: AgentContext,
  input: {
    userMessage: string;
    toolCalls: ToolCallRecord[];
    reply: string;
    error?: string;
  }
): Promise<void> {
  const names = input.toolCalls.map((t) => t.name).join(', ') || 'none';
  const failed = input.toolCalls.filter((t) => !t.ok).length;
  const preview = input.userMessage.trim().slice(0, 120);
  const description = [
    `Agent chat: "${preview}"`,
    `tools=[${names}]`,
    failed ? `failed=${failed}` : null,
    input.error ? `error=${input.error.slice(0, 80)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  try {
    await pool.query(
      `INSERT INTO activities (type, description, user_id, tenant_id)
       VALUES ($1, $2, $3, $4)`,
      ['agent_chat', description.slice(0, 500), ctx.userId, ctx.tenantId]
    );
  } catch (err) {
    console.warn('agent audit failed:', (err as Error).message);
  }
}
