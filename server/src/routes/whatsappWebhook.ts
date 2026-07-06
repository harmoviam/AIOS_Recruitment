import { Router } from 'express';
import { pool } from '../db.js';
import { verifyWebhookToken } from '../services/whatsapp.js';

/**
 * Meta WhatsApp Cloud API webhook.
 *
 * Mounted WITHOUT auth middleware — Meta's servers call it directly.
 * GET  → one-time subscription verification (hub.challenge handshake).
 * POST → inbound candidate messages; matched to a candidate by phone number
 *        (last 10 digits) and stored in the shared inbox.
 */
const router = Router();

router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && verifyWebhookToken(String(token))) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

interface WaInboundMessage {
  from: string;
  id: string;
  type: string;
  text?: { body: string };
}

router.post('/webhook', async (req, res) => {
  // Always ack fast — Meta retries aggressively on non-200.
  res.sendStatus(200);

  try {
    const entries = req.body?.entry ?? [];
    for (const entry of entries) {
      for (const change of entry.changes ?? []) {
        const messages: WaInboundMessage[] = change.value?.messages ?? [];
        const contacts = change.value?.contacts ?? [];
        for (const msg of messages) {
          if (msg.type !== 'text' || !msg.text?.body) continue;

          const last10 = msg.from.replace(/[^\d]/g, '').slice(-10);
          const { rows: candidates } = await pool.query(
            `SELECT id, name FROM candidates
             WHERE RIGHT(REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', '', 'g'), 10) = $1
             ORDER BY updated_at DESC LIMIT 1`,
            [last10]
          );
          const candidate = candidates[0];
          if (!candidate) continue;

          const senderName =
            contacts.find((c: { wa_id?: string; profile?: { name?: string } }) => c.wa_id === msg.from)
              ?.profile?.name || candidate.name;

          await pool.query(
            `INSERT INTO messages (candidate_id, sender, content, is_outgoing)
             VALUES ($1, $2, $3, FALSE)`,
            [candidate.id, senderName, msg.text.body]
          );
        }
      }
    }
  } catch (err) {
    console.error('WhatsApp webhook processing failed:', err);
  }
});

export default router;
