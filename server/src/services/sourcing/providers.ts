/**
 * Provider factory — selects rule/template/heuristic (or future LLM) implementations.
 */

import type {
  ContentGeneratorService,
  ConversationService,
  RecommendationService,
} from './ports.js';
import { ruleBasedRecommendationService } from './recommendation/ruleBasedRecommendationService.js';
import { templateContentGeneratorService } from './content/templateContentGeneratorService.js';
import { heuristicConversationService } from './conversation/heuristicConversationService.js';

export function getRecommendationService(): RecommendationService {
  const provider = (process.env.SOURCING_RECOMMENDATION_PROVIDER || 'rule').toLowerCase();
  if (provider === 'llm') {
    // Future: return llmRecommendationService
    return ruleBasedRecommendationService;
  }
  return ruleBasedRecommendationService;
}

export function getContentGeneratorService(): ContentGeneratorService {
  const provider = (process.env.SOURCING_CONTENT_PROVIDER || 'template').toLowerCase();
  if (provider === 'llm') {
    return templateContentGeneratorService;
  }
  return templateContentGeneratorService;
}

export function getConversationService(): ConversationService {
  const provider = (process.env.SOURCING_CONVERSATION_PROVIDER || 'heuristic').toLowerCase();
  if (provider === 'llm') {
    return heuristicConversationService;
  }
  return heuristicConversationService;
}
