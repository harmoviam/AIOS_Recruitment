import { _resetToolRegistryForTests, registerTool } from './registry.js';
import { draftMessageTool } from './tools/draftMessage.js';
import { parseResumeTool } from './tools/parseResume.js';
import { scoreAtsTool } from './tools/scoreAts.js';
import { scoreEligibilityTool } from './tools/scoreEligibility.js';

let registered = false;

/** Idempotent Phase 0 tool registration. */
export function ensureAgentToolsRegistered(): void {
  if (registered) return;
  registerTool(parseResumeTool);
  registerTool(scoreAtsTool);
  registerTool(scoreEligibilityTool);
  registerTool(draftMessageTool);
  registered = true;
}

/** Tests only — clears tools and allows ensureAgentToolsRegistered to run again. */
export function _resetAgentForTests(): void {
  _resetToolRegistryForTests();
  registered = false;
}

export { runAgentChat } from './runtime.js';
export { agentContextFromRequest } from './context.js';
export { listTools } from './registry.js';
