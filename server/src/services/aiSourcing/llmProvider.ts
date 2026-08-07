import OpenAI from 'openai';
import {
  REQUIREMENT_PARSER_JSON_SCHEMA,
  REQUIREMENT_PARSER_SYSTEM,
  requirementParserUserPrompt,
} from '../../prompts/ai-sourcing/requirement-parser.js';
import {
  emptyCriteria,
  parseCriteria,
  type CandidateSearchCriteria,
  type FieldConfidence,
} from '../../dto/aiSourcing/criteria.js';

export type LlmParseResult = {
  criteria: CandidateSearchCriteria;
  fieldConfidence: FieldConfidence;
  raw?: unknown;
};

/** Provider-agnostic LLM surface for AI Sourcing parsing. */
export interface LLMProvider {
  readonly name: string;
  isAvailable(): boolean;
  parseRequirements(query: string): Promise<LlmParseResult | null>;
}

function aiCfg() {
  return {
    baseURL: process.env.AI_BASE_URL || '',
    apiKey: process.env.AI_API_KEY || '',
    enabled: process.env.AI_ENABLED !== 'false',
    model: process.env.AI_MODEL || '',
    timeoutMs: Number(process.env.AI_TIMEOUT_MS) || 60_000,
  };
}

/** OpenAI-compatible chat completions (vLLM / Ollama / OpenAI / GitHub Models). */
export class OpenAiCompatibleProvider implements LLMProvider {
  readonly name = 'openai-compatible';
  private client: OpenAI | null = null;

  isAvailable(): boolean {
    const c = aiCfg();
    return Boolean(c.enabled && c.model && (c.baseURL || c.apiKey));
  }

  private getClient(): OpenAI {
    if (!this.client) {
      const c = aiCfg();
      this.client = new OpenAI({
        baseURL: c.baseURL || undefined,
        apiKey: c.apiKey || 'not-needed',
        timeout: c.timeoutMs,
        maxRetries: 1,
      });
    }
    return this.client;
  }

  async parseRequirements(query: string): Promise<LlmParseResult | null> {
    if (!this.isAvailable() || !query.trim()) return null;
    try {
      const c = aiCfg();
      const completion = await this.getClient().chat.completions.create({
        model: c.model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: REQUIREMENT_PARSER_SYSTEM },
          {
            role: 'user',
            content:
              requirementParserUserPrompt(query) +
              '\n\nRespond with JSON keys: skills, keywords, jobTitle, location, minExperienceYears, maxExperienceYears, stage, minAiScore, fieldConfidence. Schema hint: ' +
              JSON.stringify(REQUIREMENT_PARSER_JSON_SCHEMA),
          },
        ],
      });
      const text = completion.choices[0]?.message?.content;
      if (!text) return null;
      const raw = JSON.parse(text) as Record<string, unknown>;
      const { fieldConfidence: confRaw, ...rest } = raw;
      const criteria = parseCriteria({ ...emptyCriteria(), ...rest });
      const fieldConfidence: FieldConfidence = {};
      if (confRaw && typeof confRaw === 'object') {
        for (const [k, v] of Object.entries(confRaw as Record<string, unknown>)) {
          if (typeof v === 'number' && v >= 0 && v <= 1) fieldConfidence[k] = v;
        }
      }
      return { criteria, fieldConfidence, raw };
    } catch (err) {
      console.warn('[ai-sourcing] LLM parse failed:', (err as Error).message);
      return null;
    }
  }
}

let defaultProvider: LLMProvider | null = null;

export function getDefaultLlmProvider(): LLMProvider {
  if (!defaultProvider) defaultProvider = new OpenAiCompatibleProvider();
  return defaultProvider;
}

/** Test helper */
export function setDefaultLlmProvider(provider: LLMProvider | null) {
  defaultProvider = provider;
}
