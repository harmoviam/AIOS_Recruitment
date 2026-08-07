import { beforeEach, describe, expect, it } from 'vitest';
import {
  _resetAgentForTests,
  ensureAgentToolsRegistered,
  listTools,
} from '../agent/index.js';
import { openAiToolSchemas } from '../agent/registry.js';

describe('agent Phase 0 registry', () => {
  beforeEach(() => {
    _resetAgentForTests();
  });

  it('registers the four Phase 0 tools', () => {
    ensureAgentToolsRegistered();
    const names = listTools()
      .map((t) => t.name)
      .sort();
    expect(names).toEqual([
      'draft_message',
      'parse_resume',
      'score_ats',
      'score_eligibility',
    ]);
    expect(listTools().every((t) => t.gate === 'auto')).toBe(true);

    const schemas = openAiToolSchemas();
    expect(schemas).toHaveLength(4);
    expect(schemas.every((s) => s.type === 'function')).toBe(true);
  });

  it('is idempotent', () => {
    ensureAgentToolsRegistered();
    ensureAgentToolsRegistered();
    expect(listTools()).toHaveLength(4);
  });
});
