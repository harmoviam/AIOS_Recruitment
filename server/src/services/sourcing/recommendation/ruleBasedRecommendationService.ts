import { pool } from '../../../db.js';
import type { RecommendationService } from '../ports.js';
import type {
  RecommendationResult,
  RecommendationRisk,
  SourceRecommendation,
  SourcingSearchCriteria,
} from '../../../types/sourcing.js';
import { findSourcesForRecommendation } from '../../../repositories/sourcing/sourceRepository.js';

async function loadPerformance(
  tenantId: number,
  sourceId: string,
  cityId?: string,
  roleId?: string
): Promise<{ pastSuccessRate: number; applications: number; interviews: number; joinings: number }> {
  const { rows } = await pool.query(
    `SELECT past_success_rate, applications, interviews, joinings
     FROM source_performance
     WHERE tenant_id = $1 AND source_id = $2 AND status = 'ACTIVE'
       AND ($3::uuid IS NULL OR city_id = $3 OR city_id IS NULL)
       AND ($4::uuid IS NULL OR role_id = $4 OR role_id IS NULL)
     ORDER BY
       CASE WHEN city_id = $3 AND role_id = $4 THEN 0
            WHEN city_id = $3 OR role_id = $4 THEN 1
            ELSE 2 END,
       modified_date DESC
     LIMIT 1`,
    [tenantId, sourceId, cityId ?? null, roleId ?? null]
  );
  if (!rows[0]) return { pastSuccessRate: 0, applications: 0, interviews: 0, joinings: 0 };
  return {
    pastSuccessRate: Number(rows[0].past_success_rate) || 0,
    applications: Number(rows[0].applications) || 0,
    interviews: Number(rows[0].interviews) || 0,
    joinings: Number(rows[0].joinings) || 0,
  };
}

function riskFromScore(score: number, timelineDays?: number): RecommendationRisk {
  if (timelineDays != null && timelineDays <= 5 && score < 0.55) return 'HIGH';
  if (score >= 0.7) return 'LOW';
  if (score >= 0.45) return 'MEDIUM';
  return 'HIGH';
}

function buildReason(parts: string[]): string {
  return parts.filter(Boolean).join('; ') || 'Matched available active sources.';
}

export const ruleBasedRecommendationService: RecommendationService = {
  async recommend(criteria, context): Promise<RecommendationResult> {
    const limit = Math.min(criteria.limit ?? 20, 20);
    const sources = await findSourcesForRecommendation(context.tenantId, {
      cityId: criteria.cityId,
      roleId: criteria.roleId,
      experienceLevelId: criteria.experienceLevelId,
      languages: criteria.languages,
    });

    const scored: SourceRecommendation[] = [];

    for (const source of sources) {
      let score = 0;
      const reasons: string[] = [];

      const cityMatch = source.cityId === criteria.cityId;
      if (cityMatch) {
        score += 0.22;
        reasons.push('Strong city match');
      } else if (!source.cityId) {
        score += 0.08;
        reasons.push('National/open catchment source');
      }

      const roleIds = source.roleIds || [];
      if (roleIds.includes(criteria.roleId)) {
        score += 0.2;
        reasons.push('Role explicitly targeted');
      } else if (roleIds.length === 0) {
        score += 0.06;
      }

      if (criteria.experienceLevelId && (source.experienceLevelIds || []).includes(criteria.experienceLevelId)) {
        score += 0.1;
        reasons.push('Experience band match');
      }

      if (criteria.languages?.length) {
        const sourceLangs = (source.languages || []).map((l) => l.name.toLowerCase());
        const hit = criteria.languages.some((l) => sourceLangs.includes(l.toLowerCase()));
        if (hit) {
          score += 0.08;
          reasons.push('Language match');
        }
      }

      const perf = await loadPerformance(context.tenantId, source.id, criteria.cityId, criteria.roleId);
      const successBoost = Math.min(perf.pastSuccessRate / 100, 1) * 0.18;
      score += successBoost;
      if (perf.pastSuccessRate > 0) reasons.push(`Past success ${perf.pastSuccessRate.toFixed(0)}%`);

      const quality = (source.qualityRating ?? 0) / 10;
      score += quality * 0.1;
      if (source.qualityRating != null) reasons.push(`Quality ${source.qualityRating}/10`);

      const pool = source.estimatedCandidatePool ?? 0;
      score += Math.min(pool / 5000, 1) * 0.07;
      if (pool > 0) reasons.push(`Est. pool ${pool}`);

      const response = (source.responseRate ?? 0) / 100;
      score += response * 0.05;
      if (source.responseRate != null) reasons.push(`Response ${source.responseRate}%`);

      if (criteria.joiningTimelineDays != null && criteria.joiningTimelineDays <= 7) {
        if ((source.responseRate ?? 0) >= 40 || (source.dailyActiveMembers ?? 0) >= 200) {
          score += 0.05;
          reasons.push('Suitable for short joining timeline');
        } else {
          score -= 0.05;
        }
      }

      score = Math.max(0, Math.min(score, 0.99));

      const appsBase = Math.max(pool * 0.08, (source.dailyActiveMembers ?? 50) * 0.4);
      const expectedApplications = Math.round(appsBase * (0.4 + score) * Math.min(criteria.hiringCount / 20, 2));
      const expectedInterviews = Math.round(expectedApplications * (0.25 + response * 0.15));
      const expectedJoinings = Math.round(expectedInterviews * (0.25 + successBoost));

      scored.push({
        sourceId: source.id,
        sourceName: source.name,
        priority: 0,
        confidenceScore: Number(score.toFixed(2)),
        expectedApplications,
        expectedInterviews,
        expectedJoinings,
        risk: riskFromScore(score, criteria.joiningTimelineDays),
        reason: buildReason(reasons),
        qualityRating: source.qualityRating,
        responseRate: source.responseRate,
        estimatedCandidatePool: source.estimatedCandidatePool,
        channelType: source.channelType as SourceRecommendation['channelType'],
        website: source.website,
        isSampleData: source.createdBy === 'seed',
      });
    }

    scored.sort((a, b) => b.confidenceScore - a.confidenceScore);
    const top = scored.slice(0, limit).map((item, idx) => ({ ...item, priority: idx + 1 }));

    const planSummary = {
      expectedApplications: top.reduce((s, i) => s + i.expectedApplications, 0),
      expectedInterviews: top.reduce((s, i) => s + i.expectedInterviews, 0),
      expectedJoinings: top.reduce((s, i) => s + i.expectedJoinings, 0),
      overallRisk: (top[0]?.risk ?? 'MEDIUM') as RecommendationRisk,
    };

    const result: RecommendationResult = {
      provider: 'RULE_BASED',
      criteria,
      recommendations: top,
      planSummary,
    };

    const { rows } = await pool.query(
      `INSERT INTO recommendation_run (tenant_id, recruiter_user_id, criteria_json, result_json, provider, created_by)
       VALUES ($1,$2,$3::jsonb,$4::jsonb,'RULE_BASED',$5) RETURNING id`,
      [
        context.tenantId,
        context.userId ?? null,
        JSON.stringify(criteria),
        JSON.stringify(result),
        context.userId ? String(context.userId) : null,
      ]
    );
    result.runId = String(rows[0].id);
    return result;
  },
};
