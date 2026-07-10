import { Router } from 'express';
import { pool } from '../db.js';
import {
  createLiveKitToken,
  interviewRoomName,
  isJoinLinkUsable,
  isJoinWindowOpen,
  isLiveKitConfigured,
  liveKitServerUrl,
  verifyInterviewJoinToken,
} from '../services/livekit.js';

const router = Router();

type InterviewJoinRow = {
  id: number;
  scheduled_at: string;
  duration_minutes: number | null;
  tenant_id: number;
  join_code: string | null;
  meeting_link: string | null;
};

function decodeJoinToken(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

async function backfillJoinCode(interviewId: number, joinCode: string, current: InterviewJoinRow) {
  if (current.join_code === joinCode) return;
  await pool.query('UPDATE interviews SET join_code = $1 WHERE id = $2', [joinCode, interviewId]);
}

async function findInterviewByJoinToken(token: string): Promise<InterviewJoinRow | null> {
  const decoded = decodeJoinToken(token);
  if (!decoded) return null;

  if (!decoded.includes('.')) {
    const { rows } = await pool.query<InterviewJoinRow>(
      `SELECT i.id, i.scheduled_at, i.duration_minutes, i.join_code, i.meeting_link, c.tenant_id
       FROM interviews i
       JOIN candidates c ON c.id = i.candidate_id
       WHERE i.join_code = $1`,
      [decoded]
    );
    if (rows[0]) return rows[0];

    const { rows: byLink } = await pool.query<InterviewJoinRow>(
      `SELECT i.id, i.scheduled_at, i.duration_minutes, i.join_code, i.meeting_link, c.tenant_id
       FROM interviews i
       JOIN candidates c ON c.id = i.candidate_id
       WHERE i.meeting_link LIKE $1`,
      [`%/join/interview/${decoded}%`]
    );
    if (byLink[0]) {
      await backfillJoinCode(byLink[0].id, decoded, byLink[0]);
      return { ...byLink[0], join_code: decoded };
    }

    return null;
  }

  const payload = verifyInterviewJoinToken(decoded);
  if (!payload) return null;

  const { rows } = await pool.query<InterviewJoinRow>(
    `SELECT i.id, i.scheduled_at, i.duration_minutes, i.join_code, i.meeting_link, c.tenant_id
     FROM interviews i
     JOIN candidates c ON c.id = i.candidate_id
     WHERE i.id = $1 AND c.tenant_id = $2`,
    [payload.interviewId, payload.tenantId]
  );
  return rows[0] ?? null;
}

router.get('/:joinToken', async (req, res) => {
  const interview = await findInterviewByJoinToken(req.params.joinToken);
  if (!interview) return res.status(404).json({ error: 'Interview link not found' });

  const duration = interview.duration_minutes ?? 60;
  if (!isJoinLinkUsable(interview.scheduled_at, duration)) {
    return res.status(410).json({ error: 'This interview link has expired' });
  }

  const { rows } = await pool.query(
    `SELECT i.id, i.scheduled_at, i.round_type, i.status, i.duration_minutes,
            c.name AS candidate_name, t.name AS tenant_name
     FROM interviews i
     JOIN candidates c ON c.id = i.candidate_id
     JOIN tenants t ON t.id = c.tenant_id
     WHERE i.id = $1 AND c.tenant_id = $2`,
    [interview.id, interview.tenant_id]
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
    joinWindowOpen: isJoinWindowOpen(iv.scheduled_at, iv.duration_minutes ?? 60),
  });
});

router.post('/:joinToken/token', async (req, res) => {
  const interview = await findInterviewByJoinToken(req.params.joinToken);
  if (!interview) return res.status(404).json({ error: 'Interview link not found' });

  const duration = interview.duration_minutes ?? 60;
  if (!isJoinLinkUsable(interview.scheduled_at, duration)) {
    return res.status(410).json({ error: 'This interview link has expired' });
  }
  if (!isJoinWindowOpen(interview.scheduled_at, duration)) {
    return res.status(403).json({
      error: 'The video room opens 2 hours before your scheduled interview time. Please try again closer to the start.',
    });
  }

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
    [interview.id, interview.tenant_id]
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
