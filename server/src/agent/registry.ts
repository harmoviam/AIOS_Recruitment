import type { AgentToolDefinition, ChatTool } from './types.js';

const tools = new Map<string, AgentToolDefinition>();

export function registerTool(tool: AgentToolDefinition): void {
  if (tools.has(tool.name)) {
    throw new Error(`Agent tool already registered: ${tool.name}`);
  }
  tools.set(tool.name, tool);
}

export function getTool(name: string): AgentToolDefinition | undefined {
  return tools.get(name);
}

export function listTools(): AgentToolDefinition[] {
  return [...tools.values()];
}

/** OpenAI tools array for chat.completions.create. */
export function openAiToolSchemas(): ChatTool[] {
  return listTools().map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

/** Clear registry — tests only. */
export function _resetToolRegistryForTests(): void {
  tools.clear();
}
