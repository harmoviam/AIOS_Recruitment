import type OpenAI from 'openai';
import { AI_NOT_CONFIGURED, aiMode, chatCompletionWithTools } from '../services/ai.js';
import { auditAgentRun } from './audit.js';
import type { AgentContext } from './context.js';
import { getTool, openAiToolSchemas } from './registry.js';
import { AgentToolError } from './candidateAccess.js';
import type { AgentRunResult, PendingApproval, ToolCallRecord } from './types.js';

const MAX_STEPS = 8;

const SYSTEM_PROMPT = `You are AIOS Recruiting Copilot, an assistive agent for recruiters inside an ATS.

Rules:
- Use only the provided tools. Do not invent candidate data, scores, or contact details.
- Prefer tools when the user asks to parse, score, check eligibility, or draft messages.
- Summarize tool results clearly for a busy recruiter (scores, gaps, next actions).
- Never claim you sent a message — draft_message only drafts.
- If a tool returns an error, explain it and suggest the next step.
- Keep replies concise.`;

export async function runAgentChat(
  ctx: AgentContext,
  input: {
    message: string;
    history?: { role: 'user' | 'assistant'; content: string }[];
  }
): Promise<AgentRunResult> {
  const toolCalls: ToolCallRecord[] = [];
  const pendingApprovals: PendingApproval[] = [];

  if (aiMode() === 'disabled') {
    const result: AgentRunResult = {
      reply: AI_NOT_CONFIGURED,
      toolCalls,
      pendingApprovals,
      steps: 0,
      error: AI_NOT_CONFIGURED,
    };
    await auditAgentRun(ctx, {
      userMessage: input.message,
      toolCalls,
      reply: result.reply,
      error: result.error,
    });
    return result;
  }

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...(input.history || [])
      .filter((m) => m.content?.trim())
      .slice(-12)
      .map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: input.message },
  ];

  if (ctx.jobId) {
    messages.splice(1, 0, {
      role: 'system',
      content: `Active job context id: ${ctx.jobId}. Prefer this job_id when scoring unless the user names another job.`,
    });
  }

  const tools = openAiToolSchemas();
  let steps = 0;
  let finalReply = '';

  while (steps < MAX_STEPS) {
    steps += 1;
    const { message, error } = await chatCompletionWithTools({
      messages,
      tools,
      temperature: 0.2,
      maxTokens: 2048,
    });

    if (!message) {
      const result: AgentRunResult = {
        reply: error || 'The AI model returned no response.',
        toolCalls,
        pendingApprovals,
        steps,
        error: error || 'empty_model_response',
      };
      await auditAgentRun(ctx, {
        userMessage: input.message,
        toolCalls,
        reply: result.reply,
        error: result.error,
      });
      return result;
    }

    const calls = message.tool_calls;
    if (!calls?.length) {
      finalReply = message.content?.trim() || 'Done.';
      break;
    }

    messages.push({
      role: 'assistant',
      content: message.content,
      tool_calls: calls,
    });

    for (const call of calls) {
      if (call.type !== 'function') continue;
      const name = call.function.name;
      const tool = getTool(name);
      const started = Date.now();

      if (!tool) {
        const record: ToolCallRecord = {
          name,
          arguments: {},
          gate: 'auto',
          ok: false,
          durationMs: Date.now() - started,
          error: `Unknown tool: ${name}`,
        };
        toolCalls.push(record);
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify({ error: record.error }),
        });
        continue;
      }

      let rawArgs: unknown = {};
      try {
        rawArgs = call.function.arguments
          ? JSON.parse(call.function.arguments)
          : {};
      } catch {
        rawArgs = {};
      }

      if (tool.gate === 'confirm' || tool.gate === 'admin') {
        pendingApprovals.push({
          tool: name,
          arguments: rawArgs,
          reason: `Tool "${name}" requires ${tool.gate} approval before execution`,
        });
        const record: ToolCallRecord = {
          name,
          arguments: rawArgs,
          gate: tool.gate,
          ok: true,
          durationMs: Date.now() - started,
        };
        toolCalls.push(record);
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify({
            status: 'pending_approval',
            gate: tool.gate,
            message: record.ok
              ? `Not executed — awaiting ${tool.gate} approval`
              : 'Not executed',
          }),
        });
        continue;
      }

      const parsed = tool.schema.safeParse(rawArgs);
      if (!parsed.success) {
        const errMsg = parsed.error.issues.map((i) => i.message).join('; ');
        toolCalls.push({
          name,
          arguments: rawArgs,
          gate: tool.gate,
          ok: false,
          durationMs: Date.now() - started,
          error: errMsg,
        });
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify({ error: errMsg }),
        });
        continue;
      }

      try {
        const data = await tool.handler(ctx, parsed.data);
        toolCalls.push({
          name,
          arguments: parsed.data,
          gate: tool.gate,
          ok: true,
          durationMs: Date.now() - started,
        });
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(data),
        });
      } catch (err) {
        const errMsg =
          err instanceof AgentToolError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Tool failed';
        toolCalls.push({
          name,
          arguments: parsed.data,
          gate: tool.gate,
          ok: false,
          durationMs: Date.now() - started,
          error: errMsg,
        });
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify({ error: errMsg }),
        });
      }
    }

    if (pendingApprovals.length) {
      finalReply =
        message.content?.trim() ||
        `I prepared ${pendingApprovals.length} action(s) that need your approval before continuing.`;
      break;
    }
  }

  if (!finalReply && steps >= MAX_STEPS) {
    finalReply = 'Stopped after the maximum number of tool steps. Please narrow the request.';
  }

  const result: AgentRunResult = {
    reply: finalReply || 'Done.',
    toolCalls,
    pendingApprovals,
    steps,
  };
  await auditAgentRun(ctx, {
    userMessage: input.message,
    toolCalls,
    reply: result.reply,
  });
  return result;
}
