import { z } from 'zod';
import {
  computeEligibilityScore,
  evaluateExperienceGate,
} from '../../services/eligibilityScore.js';
import { AgentToolError, loadAccessibleCandidate, loadJobForTenant } from '../candidateAccess.js';
import type { AgentToolDefinition } from '../types.js';

const schema = z.object({
  candidate_id: z.number().int().positive(),
  job_id: z.number().int().positive().optional(),
});

export const scoreEligibilityTool: AgentToolDefinition<typeof schema> = {
  name: 'score_eligibility',
  description:
    'Compute deterministic eligibility (0–10) from mandatory/preferred skills and the experience YOE gate for a candidate vs a job.',
  gate: 'auto',
  schema,
  parameters: {
    type: 'object',
    properties: {
      candidate_id: { type: 'integer', description: 'Candidate id' },
      job_id: {
        type: 'integer',
        description: 'Job id (defaults to candidate job or chat job context)',
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
    if (!job) {
      throw new AgentToolError(
        'No job available for eligibility scoring. Pass job_id or set job context on the chat request.'
      );
    }

    const text = candidate.resume_text || '';
    const eligibility = computeEligibilityScore(candidate.parsed_profile, text, job);
    const gate = evaluateExperienceGate(
      candidate.parsed_profile.total_experience_years,
      job.min_experience
    );

    return {
      candidate_id: candidate.id,
      candidate_name: candidate.name,
      job_id: job.id,
      job_title: job.title,
      eligibility_score: eligibility.score,
      experience_gate: gate,
      mandatory_matched: eligibility.mandatory_matched,
      mandatory_missing: eligibility.mandatory_missing,
      preferred_matched: eligibility.preferred_matched,
      preferred_missing: eligibility.preferred_missing,
      mandatory_rate: eligibility.mandatory_rate,
      preferred_rate: eligibility.preferred_rate,
    };
  },
};
