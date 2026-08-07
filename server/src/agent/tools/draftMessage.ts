import { z } from 'zod';
import { pool } from '../../db.js';
import { aiMode, suggestMessages } from '../../services/ai.js';
import { loadAccessibleCandidate } from '../candidateAccess.js';
import type { AgentToolDefinition } from '../types.js';

const schema = z.object({
  candidate_id: z.number().int().positive(),
  purpose: z.enum(['outreach', 'whatsapp_reply']).optional(),
});

export const draftMessageTool: AgentToolDefinition<typeof schema> = {
  name: 'draft_message',
  description:
    'Draft candidate-facing WhatsApp/outreach message suggestions. Does NOT send messages.',
  gate: 'auto',
  schema,
  parameters: {
    type: 'object',
    properties: {
      candidate_id: { type: 'integer', description: 'Candidate id' },
      purpose: {
        type: 'string',
        enum: ['outreach', 'whatsapp_reply'],
        description: 'outreach (default) or whatsapp_reply for an ongoing thread',
      },
    },
    required: ['candidate_id'],
    additionalProperties: false,
  },
  async handler(ctx, args) {
    const candidate = await loadAccessibleCandidate(ctx, args.candidate_id);
    const purpose = args.purpose ?? 'outreach';

    let recentMessages:
      | { direction: 'candidate' | 'recruiter'; content: string }[]
      | undefined;

    if (purpose === 'whatsapp_reply') {
      const { rows: msgs } = await pool.query(
        `SELECT content, is_outgoing FROM messages
         WHERE candidate_id = $1
         ORDER BY sent_at DESC LIMIT 5`,
        [candidate.id]
      );
      recentMessages = msgs
        .slice()
        .reverse()
        .map((m) => ({
          direction: m.is_outgoing ? ('recruiter' as const) : ('candidate' as const),
          content: String(m.content),
        }));
    }

    if (aiMode() === 'live') {
      const ai = await suggestMessages({
        candidateName: candidate.name,
        stage: candidate.stage,
        jobTitle: candidate.job_title,
        jobLocation: candidate.job_location,
        salaryExpectation: candidate.salary_expectation,
        recentMessages,
        purpose,
      });
      if (ai?.length) {
        return {
          candidate_id: candidate.id,
          candidate_name: candidate.name,
          purpose,
          source: 'ai',
          suggestions: ai,
        };
      }
    }

    const first = candidate.name.split(' ')[0] || candidate.name;
    const role = candidate.job_title || 'the role';
    return {
      candidate_id: candidate.id,
      candidate_name: candidate.name,
      purpose,
      source: 'template',
      suggestions: [
        `Hi ${first}, quick follow-up on your application for ${role}. Any questions?`,
        `Hi ${first}, we'd like to schedule a short screening call for ${role}. What time works this week?`,
        `Hi ${first}, could you confirm your notice period and earliest joining date?`,
        `Hi ${first}, your profile looks relevant for ${role} — are you open to a conversation?`,
        `Hi ${first}, I'll share available interview slots shortly. Please pick one that suits you.`,
      ],
    };
  },
};
