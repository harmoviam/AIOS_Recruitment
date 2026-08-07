/**
 * Progressive sourcing-plan builder — emits stages as they complete
 * so HTTP handlers can stream (SSE) or collect into one JSON response.
 */

import { pool } from '../../db.js';
import type {
  ContentPack,
  RecommendationResult,
  StructuredIntent,
} from '../../types/sourcing.js';
import {
  getContentGeneratorService,
  getConversationService,
  getRecommendationService,
} from './providers.js';

export type CopilotPlanStage = 'parsing' | 'recommending' | 'generating_content';

export type CopilotPlanEvent =
  | { type: 'status'; stage: CopilotPlanStage }
  | { type: 'intent'; intent: StructuredIntent | null }
  | { type: 'recommendations'; recommendations: RecommendationResult }
  | { type: 'content'; content: ContentPack | null }
  | { type: 'done' };

export class CopilotPlanHttpError extends Error {
  constructor(
    message: string,
    public status: number,
    public intent: StructuredIntent | null = null
  ) {
    super(message);
    this.name = 'CopilotPlanHttpError';
  }
}

export interface CopilotPlanInput {
  text?: string;
  cityId?: string;
  roleId?: string;
  hiringCount?: number;
  experienceLevelId?: string;
  joiningTimelineDays?: number;
  salaryMin?: number;
  salaryMax?: number;
  shift?: string;
  languages?: string[];
  includeContent?: boolean;
}

export async function runCopilotPlan(
  input: CopilotPlanInput,
  context: { tenantId: number; userId: number },
  emit: (event: CopilotPlanEvent) => void | Promise<void> = () => {}
): Promise<{
  intent: StructuredIntent | null;
  recommendations: RecommendationResult;
  content: ContentPack | null;
}> {
  let cityId = input.cityId;
  let roleId = input.roleId;
  let hiringCount = input.hiringCount;
  let intent: StructuredIntent | null = null;

  if (input.text) {
    await emit({ type: 'status', stage: 'parsing' });
    intent = await getConversationService().parse(
      { text: input.text },
      context
    );
    cityId = cityId || intent.cityId;
    roleId = roleId || intent.roleId;
    hiringCount = hiringCount || intent.hiringCount;
    await emit({ type: 'intent', intent });
  } else {
    await emit({ type: 'intent', intent: null });
  }

  if (!cityId || !roleId || !hiringCount) {
    throw new CopilotPlanHttpError(
      'cityId, roleId, and hiringCount are required (confirm structured intent)',
      400,
      intent
    );
  }

  await emit({ type: 'status', stage: 'recommending' });
  const criteria = {
    cityId,
    roleId,
    hiringCount,
    experienceLevelId: input.experienceLevelId,
    joiningTimelineDays: input.joiningTimelineDays ?? intent?.joiningTimelineDays,
    salaryMin: input.salaryMin ?? intent?.salaryHint,
    salaryMax: input.salaryMax ?? intent?.salaryHint,
    shift: input.shift,
    languages: input.languages,
    limit: 20,
  };

  const recommendations = await getRecommendationService().recommend(criteria, context);
  await emit({ type: 'recommendations', recommendations });

  let content: ContentPack | null = null;
  if (input.includeContent !== false) {
    await emit({ type: 'status', stage: 'generating_content' });
    const [city, role] = await Promise.all([
      pool.query(`SELECT name FROM sourcing_city WHERE id = $1 AND tenant_id = $2`, [
        cityId,
        context.tenantId,
      ]),
      pool.query(`SELECT name FROM sourcing_role WHERE id = $1 AND tenant_id = $2`, [
        roleId,
        context.tenantId,
      ]),
    ]);
    content = await getContentGeneratorService().generate(
      {
        cityName: String(city.rows[0]?.name || intent?.cityName || ''),
        roleName: String(role.rows[0]?.name || intent?.roleName || ''),
        hiringCount,
        salaryMin: criteria.salaryMin,
        salaryMax: criteria.salaryMax,
        experienceLabel: intent?.experienceHint,
        shift: input.shift,
        languages: input.languages,
        sourceName: recommendations.recommendations[0]?.sourceName,
      },
      context
    );
    await emit({ type: 'content', content });
  } else {
    await emit({ type: 'content', content: null });
  }

  await emit({ type: 'done' });
  return { intent, recommendations, content };
}
