import crypto from 'crypto';
import type { Request } from 'express';
import jwt from 'jsonwebtoken';
import { AccessToken } from 'livekit-server-sdk';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const JOIN_PATH_RE = /\/join\/interview\/([^/?#]+)/;

export function isLiveKitConfigured(): boolean {
  return !!(process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET && process.env.LIVEKIT_URL);
}

export function liveKitServerUrl(): string {
  return process.env.LIVEKIT_URL || '';
}

export function interviewRoomName(interviewId: number): string {
  return `aios-iv-${interviewId}`;
}

/** Public browser URL for candidate join links (no trailing slash). */
export function appPublicUrl(req?: Pick<Request, 'headers' | 'protocol'>): string {
  const fromEnv = process.env.APP_PUBLIC_URL?.trim().replace(/\/$/, '');
  if (fromEnv) return fromEnv;

  if (req && process.env.NODE_ENV === 'production') {
    const proto =
      (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0]?.trim() ||
      req.protocol ||
      'https';
    const host =
      (req.headers['x-forwarded-host'] as string | undefined)?.split(',')[0]?.trim() ||
      req.headers.host;
    if (host && !host.includes('localhost') && !host.startsWith('127.')) {
      return `${proto}://${host}`;
    }
  }

  return 'http://localhost:5174';
}

export function extractJoinToken(meetingLink: string): string | null {
  const match = meetingLink.match(JOIN_PATH_RE);
  return match ? match[1] : null;
}

export function candidateJoinPath(joinToken: string, baseUrl?: string): string {
  const base = (baseUrl || appPublicUrl()).replace(/\/$/, '');
  return `${base}/join/interview/${joinToken}`;
}

/** Rewrite stale dev/localhost join links to the current public app URL. */
export function normalizeMeetingLink(
  meetingLink: string | null | undefined,
  baseUrl?: string
): string | null {
  if (!meetingLink) return null;
  const token = extractJoinToken(meetingLink);
  if (!token) return meetingLink;

  const base = (baseUrl || appPublicUrl()).replace(/\/$/, '');
  if (base.includes('localhost')) return meetingLink;

  const normalized = candidateJoinPath(token, base);
  try {
    if (new URL(meetingLink).origin !== new URL(normalized).origin) return normalized;
  } catch {
    if (meetingLink.includes('localhost') || meetingLink.includes('127.0.0.1')) return normalized;
  }
  return meetingLink;
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

/** Short URL-safe code for candidate join links (no dots — WhatsApp truncates JWT URLs at `.`). */
export function generateJoinCode(): string {
  return crypto.randomBytes(12).toString('base64url');
}

/** Whether a candidate may open the join page for this interview. */
export function isJoinLinkUsable(scheduledAt: string | Date, durationMinutes = 60): boolean {
  const start = new Date(scheduledAt).getTime();
  const now = Date.now();
  const earliest = start - 30 * 24 * 60 * 60 * 1000;
  const latest = start + (durationMinutes + 24 * 60) * 60 * 1000;
  return now >= earliest && now <= latest;
}

/** Whether a candidate may enter the live video room right now. */
export function isJoinWindowOpen(scheduledAt: string | Date, durationMinutes = 60): boolean {
  const start = new Date(scheduledAt).getTime();
  const now = Date.now();
  const earliest = start - 2 * 60 * 60 * 1000;
  const latest = start + (durationMinutes + 90) * 60 * 1000;
  return now >= earliest && now <= latest;
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
