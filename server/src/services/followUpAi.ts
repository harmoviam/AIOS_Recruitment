import { pool } from '../dbConfig.js';
import {
  aiMode,
  generateFollowUpMessage,
  generateFollowUpScript,
  type FollowUpMessageInput,
  type FollowUpScriptInput,
} from './ai.js';

export interface FollowUpEnrichmentRow {
  id: number;
  tenant_id: number;
  candidate_id: number;
  category: string;
  type: string;
  due_at: string;
  milestone_day?: number | null;
  candidate_name: string;
  candidate_stage: string;
  job_title?: string | null;
  interview_at?: string | null;
  candidate_expected_joining_at?: string | null;
  candidate_joined_at?: string | null;
  meeting_link?: string | null;
}

function toScriptInput(row: FollowUpEnrichmentRow, priorOutcomes: FollowUpScriptInput['priorOutcomes']): FollowUpScriptInput {
  return {
    category: row.category,
    type: row.type,
    dueAt: row.due_at,
    milestoneDay: row.milestone_day ?? null,
    candidateName: row.candidate_name,
    stage: row.candidate_stage,
    jobTitle: row.job_title ?? null,
    interviewAt: row.interview_at ?? null,
    expectedJoiningAt: row.candidate_expected_joining_at ?? null,
    joinedAt: row.candidate_joined_at ?? null,
    priorOutcomes,
  };
}

/** Generate call script + WhatsApp message for one follow-up and persist them. */
export async function enrichFollowUp(row: FollowUpEnrichmentRow): Promise<boolean> {
  if (aiMode() === 'disabled') return false;

  const { rows: prior } = await pool.query(
    `SELECT category, outcome, completed_at FROM follow_ups
     WHERE tenant_id = $1 AND candidate_id = $2 AND outcome IS NOT NULL AND completed_at IS NOT NULL
     ORDER BY completed_at DESC LIMIT 5`,
    [row.tenant_id, row.candidate_id]
  );
  const priorOutcomes = prior.map((p) => ({
    category: p.category,
    outcome: p.outcome,
    completedAt: p.completed_at,
  }));

  const scriptInput = toScriptInput(row, priorOutcomes);
  const messageInput: FollowUpMessageInput = {
    ...scriptInput,
    meetingLink: row.meeting_link ?? null,
  };

  const [script, message] = await Promise.all([
    generateFollowUpScript(scriptInput),
    generateFollowUpMessage(messageInput),
  ]);
  if (!script && !message) return false;

  await pool.query(
    `UPDATE follow_ups
     SET ai_suggestion = COALESCE($1, ai_suggestion),
         whatsapp_message = COALESCE($2, whatsapp_message)
     WHERE id = $3 AND tenant_id = $4`,
    [script, message, row.id, row.tenant_id]
  );
  return true;
}

/**
 * Backfill AI call scripts and WhatsApp messages for rule-generated follow-ups.
 * Fire-and-forget after sync — bounded batch to avoid overloading Ollama.
 */
export async function enrichPendingFollowUps(tenantId: number, limit = 12): Promise<void> {
  if (aiMode() === 'disabled') return;

  const { rows } = await pool.query(
    `SELECT f.id, f.tenant_id, f.candidate_id, f.category, f.type, f.due_at, f.milestone_day,
            c.name AS candidate_name, c.stage AS candidate_stage,
            c.expected_joining_at AS candidate_expected_joining_at,
            c.joined_at AS candidate_joined_at,
            j.title AS job_title, i.scheduled_at AS interview_at, i.meeting_link
     FROM follow_ups f
     JOIN candidates c ON c.id = f.candidate_id AND c.tenant_id = f.tenant_id
     LEFT JOIN jobs j ON j.id = c.job_id AND j.tenant_id = f.tenant_id
     LEFT JOIN interviews i ON i.id = f.interview_id
     WHERE f.tenant_id = $1
       AND f.category <> 'manual'
       AND f.completed_at IS NULL
       AND (f.ai_suggestion IS NULL OR f.whatsapp_message IS NULL)
     ORDER BY f.due_at ASC
     LIMIT $2`,
    [tenantId, limit]
  );

  for (const row of rows) {
    try {
      await enrichFollowUp(row as FollowUpEnrichmentRow);
    } catch (err) {
      console.warn(`Follow-up AI enrich failed for ${row.id}:`, (err as Error).message);
    }
  }
}
