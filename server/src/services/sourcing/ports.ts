/**
 * AI-ready ports for the Sourcing Intelligence Agent.
 * Swap implementations via providers.ts / env without changing use-cases.
 */

import type {
  ContentPack,
  ContentRequest,
  NaturalLanguageQuery,
  RecommendationResult,
  SourcingSearchCriteria,
  StructuredIntent,
} from '../../types/sourcing.js';

export interface RecommendationService {
  recommend(
    criteria: SourcingSearchCriteria,
    context: { tenantId: number; userId?: number }
  ): Promise<RecommendationResult>;
}

export interface ContentGeneratorService {
  generate(
    request: ContentRequest,
    context: { tenantId: number; userId?: number }
  ): Promise<ContentPack>;
}

export interface ConversationService {
  parse(
    query: NaturalLanguageQuery,
    context: { tenantId: number; userId?: number }
  ): Promise<StructuredIntent>;
}
