import { Router } from 'express';
import { pool } from '../db.js';
import {
  createLiveKitToken,
  interviewRoomName,
  isJoinWindowOpen,
  isLiveKitConfigured,
  liveKitServerUrl,
  verifyInterviewJoinToken,
} from '../services/livekit.js';

const router = Router();

type JoinPayload = { interviewId: number; tenantId: number };

function decodeJoinToken(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

async function resolveJoinToken(token: string): Promise<JoinPayload | null> {
  const decoded = decodeJoinToken(token);

  // Short opaque codes have no dots — avoids WhatsApp breaking JWT links at `.`.
  if (!decoded.includes('.')) {
    const { rows } = await pool.query<{
      id: number;
      scheduled_at: string;
      duration_minutes: number | null;
      tenant_id: number;
    }>(
      `SELECT i.id, i.scheduled_at, i.duration_minutes, c.tenant_id
       FROM interviews i
       JOIN candidates c ON c.id = i.candidate_id
       WHERE i.join_code = $1`,
      [decoded]
    );
    if (!rows[0]) return null;
    const iv = rows[0];
    if (!isJoinWindowOpen(iv.scheduled_at, iv.duration_minutes ?? 60)) return null;
    return { interviewId: iv.id, tenantId: iv.tenant_id };
  }

  return verifyInterviewJoinToken(decoded);
}

router.get('/:joinToken', async (req, res) => {
  const payload = await resolveJoinToken(req.params.joinToken);
  if (!payload) return res.status(401).json({ error: 'Invalid or expired interview link' });

  const { rows } = await pool.query(
    `SELECT i.id, i.scheduled_at, i.round_type, i.status, i.duration_minutes,
            c.name AS candidate_name, t.name AS tenant_name
     FROM interviews i
     JOIN candidates c ON c.id = i.candidate_id
     JOIN tenants t ON t.id = c.tenant_id
     WHERE i.id = $1 AND c.tenant_id = $2`,
    [payload.interviewId, payload.tenantId]
  );

  if (!rows[0]) return res.status(404).json({ error: 'Interview not found' });

  const iv = rows[0];
  res.json({
    interviewId: iv.id,
    candidateName: iv.candidate_name,
    tenantName: iv.tenant_name,
    scheduledAt: iv.scheduled_at,
    roundType: iv.round_type,
    status: iv.status,
    livekitConfigured: isLiveKitConfigured(),
  });
});

router.post('/:joinToken/token', async (req, res) => {
  const payload = await resolveJoinToken(req.params.joinToken);
  if (!payload) return res.status(401).json({ error: 'Invalid or expired interview link' });

  const participantName = String(req.body.participantName || '').trim();
  if (!participantName || participantName.length > 80) {
    return res.status(400).json({ error: 'participantName is required' });
  }

  if (!isLiveKitConfigured()) {
    return res.status(503).json({
      error: 'Video calling is not configured on this server. Ask your recruiter to set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET.',
    });
  }

  const { rows } = await pool.query(
    `SELECT i.id, c.name AS candidate_name
     FROM interviews i
     JOIN candidates c ON c.id = i.candidate_id
     WHERE i.id = $1 AND c.tenant_id = $2`,
    [payload.interviewId, payload.tenantId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Interview not found' });

  const roomName = interviewRoomName(rows[0].id);
  const identity = `guest-${Date.now()}-${participantName.slice(0, 24).replace(/\s+/g, '-')}`;
  const token = await createLiveKitToken(roomName, identity, participantName);

  res.json({
    serverUrl: liveKitServerUrl(),
    token,
    roomName,
    participantName,
    candidateName: rows[0].candidate_name,
  });
});

export default router;
