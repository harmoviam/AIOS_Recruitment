import { z } from 'zod';
import { computeAtsScore } from '../../services/atsScore.js';
import { AgentToolError, loadAccessibleCandidate, loadJobForTenant } from '../candidateAccess.js';
import type { AgentToolDefinition } from '../types.js';

const schema = z.object({
  candidate_id: z.number().int().positive(),
  job_id: z.number().int().positive().optional(),
});

export const scoreAtsTool: AgentToolDefinition<typeof schema> = {
  name: 'score_ats',
  description:
    'Compute a deterministic 0–100 ATS resume score for a candidate, optionally against a job. ' +
    'Uses parsed_profile + resume_text already stored on the candidate.',
  gate: 'auto',
  schema,
  parameters: {
    type: 'object',
    properties: {
      candidate_id: { type: 'integer', description: 'Candidate id' },
      job_id: {
        type: 'integer',
        description: 'Optional job id to score JD keyword match against (defaults to candidate job or chat job)',
      },
    },
    required: ['candidate_id'],
    additionalProperties: false,
  },
  async handler(ctx, args) {
    const candidate = await loadAccessibleCandidate(ctx, args.candidate_id);
    if (!candidate.parsed_profile?.name) {
      throw new AgentToolError(
        'Candidate has no parsed_profile. Call parse_resume first or upload a resume.'
      );
    }

    const jobId = args.job_id ?? ctx.jobId ?? candidate.job_id;
    const job = await loadJobForTenant(ctx.tenantId, jobId);
    const text = candidate.resume_text || '';
    const ats = computeAtsScore(candidate.parsed_profile, text, job);

    return {
      candidate_id: candidate.id,
      candidate_name: candidate.name,
      job_id: job?.id ?? null,
      job_title: job?.title ?? null,
      score: ats.score,
      grade: ats.grade,
      missing: ats.missing,
      recommendations: ats.recommendations.slice(0, 5),
      matched_keywords: ats.matched_keywords.slice(0, 20),
      missing_keywords: ats.missing_keywords.slice(0, 20),
      scored_against_job: ats.scored_against_job,
      categories: ats.categories.map((c) => ({
        key: c.key,
        label: c.label,
        score: c.score,
        max: c.max,
      })),
    };
  },
};
