import jwt from 'jsonwebtoken';
import { AccessToken } from 'livekit-server-sdk';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

export function isLiveKitConfigured(): boolean {
  return !!(process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET && process.env.LIVEKIT_URL);
}

export function liveKitServerUrl(): string {
  return process.env.LIVEKIT_URL || '';
}

export function interviewRoomName(interviewId: number): string {
  return `aios-iv-${interviewId}`;
}

export function appPublicUrl(): string {
  return (process.env.APP_PUBLIC_URL || 'http://localhost:5174').replace(/\/$/, '');
}

export function candidateJoinPath(joinToken: string): string {
  return `${appPublicUrl()}/join/interview/${joinToken}`;
}

interface InterviewJoinPayload {
  interviewId: number;
  tenantId: number;
  purpose: 'interview_join';
}

export function createInterviewJoinToken(
  interviewId: number,
  tenantId: number,
  expiresAt: Date
): string {
  return jwt.sign({ interviewId, tenantId, purpose: 'interview_join' } satisfies InterviewJoinPayload, JWT_SECRET, {
    expiresIn: Math.max(60, Math.floor((expiresAt.getTime() - Date.now()) / 1000)),
  });
}

export function verifyInterviewJoinToken(token: string): InterviewJoinPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as InterviewJoinPayload;
    if (payload.purpose !== 'interview_join' || !payload.interviewId || !payload.tenantId) return null;
    return payload;
  } catch {
    return null;
  }
}

export function interviewJoinExpiry(scheduledAt: string | Date, durationMinutes = 60): Date {
  const start = new Date(scheduledAt);
  return new Date(start.getTime() + (durationMinutes + 30) * 60 * 1000);
}

export async function createLiveKitToken(
  roomName: string,
  identity: string,
  displayName: string,
  options?: { canPublish?: boolean; canSubscribe?: boolean }
): Promise<string> {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error('LiveKit is not configured');
  }

  const at = new AccessToken(apiKey, apiSecret, {
    identity,
    name: displayName,
    ttl: '4h',
  });

  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: options?.canPublish ?? true,
    canSubscribe: options?.canSubscribe ?? true,
  });

  return at.toJwt();
}
