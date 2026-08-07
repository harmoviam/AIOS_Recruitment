import { pool } from '../db.js';
import { sendWhatsAppText, withSenderSignature, type WaSendResult } from './whatsapp/index.js';

export interface CandidateMessageResult {
  message: { id: number; candidate_id: number; sender: string; content: string; is_outgoing: boolean; sent_at: string };
  wa: WaSendResult;
  waStatus: 'simulated' | 'sent' | 'failed';
}

/** Store an outbound message and deliver via WhatsApp when configured. */
export async function storeAndSendCandidateWhatsApp(params: {
  candidateId: number;
  tenantId: number;
  userId: number;
  senderName: string;
  content: string;
}): Promise<CandidateMessageResult> {
  const { candidateId, tenantId, userId, senderName, content } = params;
  const trimmed = content.trim();

  const { rows } = await pool.query(
    `INSERT INTO messages (candidate_id, sender, content, is_outgoing)
     VALUES ($1, $2, $3, TRUE) RETURNING *`,
    [candidateId, senderName, trimmed]
  );

  const [{ rows: userRows }, { rows: brandRows }, { rows: cand }] = await Promise.all([
    pool.query('SELECT wa_signature FROM users WHERE id = $1', [userId]),
    pool.query(`SELECT value FROM settings WHERE tenant_id = $1 AND key = 'branding'`, [tenantId]),
    pool.query('SELECT phone FROM candidates WHERE id = $1', [candidateId]),
  ]);

  const signature = userRows[0]?.wa_signature || senderName;
  const companyName = brandRows[0]?.value?.companyName;
  const hasUrl = /https?:\/\//i.test(trimmed);
  const wa = await sendWhatsAppText(
    cand[0]?.phone ?? null,
    withSenderSignature(trimmed, signature, companyName),
    { previewUrl: hasUrl }
  );
  const waStatus = wa.simulated ? 'simulated' : wa.delivered ? 'sent' : 'failed';
  if (wa.error) console.warn(`WhatsApp delivery failed for candidate ${candidateId}: ${wa.error}`);

  await pool.query('UPDATE messages SET wa_status = $1, wa_error = $2 WHERE id = $3', [
    waStatus,
    wa.error ?? null,
    rows[0].id,
  ]);

  await pool.query(
    'INSERT INTO activities (type, description, user_id, candidate_id, tenant_id) VALUES ($1, $2, $3, $4, $5)',
    ['message', `${senderName} sent WhatsApp message (${waStatus})`, userId, candidateId, tenantId]
  );

  return { message: { ...rows[0], wa_status: waStatus, wa_error: wa.error ?? null }, wa, waStatus };
}
