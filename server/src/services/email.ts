import { pool } from '../db.js';

/**
 * Transactional email — Resend HTTP API (https://resend.com).
 *
 * Mirrors the WhatsApp/AI integration pattern:
 *  - disabled (default): EMAIL_API_KEY or EMAIL_FROM missing → sends are
 *    skipped and logged with status 'disabled'. Dev-safe: password-reset
 *    keeps returning the dev reset URL, interview invites simply don't email.
 *  - live: EMAIL_API_KEY + EMAIL_FROM set and EMAIL_ENABLED not "false".
 *
 * EMAIL_FROM must be on a verified sending domain, e.g.
 *   EMAIL_FROM="HarmiRecruit <notify@mail.harmirecruit.com>"
 *
 * Every send is fail-soft (never throws into the calling route) and recorded
 * in email_log for the per-candidate history and debugging.
 */

const RESEND_API_URL = 'https://api.resend.com/emails';

function cfg() {
  return {
    apiKey: process.env.EMAIL_API_KEY || '',
    from: process.env.EMAIL_FROM || '',
    enabled: process.env.EMAIL_ENABLED !== 'false',
  };
}

export function emailMode(): 'live' | 'disabled' {
  const c = cfg();
  return c.enabled && c.apiKey && c.from ? 'live' : 'disabled';
}

export interface EmailSendResult {
  status: 'sent' | 'failed' | 'disabled';
  providerId?: string;
  error?: string;
}

export interface SendEmailInput {
  tenantId: number | null;
  to: string;
  template: string;
  subject: string;
  html: string;
  /** Optional ICS calendar payload attached as invite.ics. */
  ics?: string;
}

async function logEmail(input: SendEmailInput, result: EmailSendResult): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO email_log (tenant_id, to_email, template, subject, status, provider_id, error)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        input.tenantId,
        input.to,
        input.template,
        input.subject,
        result.status,
        result.providerId || null,
        result.error || null,
      ]
    );
  } catch (err) {
    console.warn('email_log insert failed:', (err as Error).message);
  }
}

export async function sendEmail(input: SendEmailInput): Promise<EmailSendResult> {
  if (emailMode() === 'disabled') {
    const result: EmailSendResult = { status: 'disabled', error: 'Email not configured' };
    await logEmail(input, result);
    return result;
  }

  try {
    const body: Record<string, unknown> = {
      from: cfg().from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
    };
    if (input.ics) {
      body.attachments = [
        {
          filename: 'invite.ics',
          content: Buffer.from(input.ics).toString('base64'),
          content_type: 'text/calendar; method=REQUEST',
        },
      ];
    }

    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg().apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const result: EmailSendResult = {
        status: 'failed',
        error: `Resend ${res.status}: ${text.slice(0, 300)}`,
      };
      console.warn('Email send failed:', result.error);
      await logEmail(input, result);
      return result;
    }

    const data = (await res.json()) as { id?: string };
    const result: EmailSendResult = { status: 'sent', providerId: data.id };
    await logEmail(input, result);
    return result;
  } catch (err) {
    const result: EmailSendResult = { status: 'failed', error: (err as Error).message };
    console.warn('Email send failed:', result.error);
    await logEmail(input, result);
    return result;
  }
}

// ── ICS calendar payloads ────────────────────────────────────────────

function icsEscape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function icsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export function buildInterviewIcs(input: {
  uid: string;
  title: string;
  description?: string;
  location?: string;
  start: Date;
  durationMinutes: number;
  organizerName: string;
  method?: 'REQUEST' | 'CANCEL';
  sequence?: number;
}): string {
  const end = new Date(input.start.getTime() + input.durationMinutes * 60_000);
  const method = input.method || 'REQUEST';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//HarmiRecruit//Interview//EN',
    `METHOD:${method}`,
    'BEGIN:VEVENT',
    `UID:${icsEscape(input.uid)}`,
    `SEQUENCE:${input.sequence ?? 0}`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(input.start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsEscape(input.title)}`,
    ...(input.description ? [`DESCRIPTION:${icsEscape(input.description)}`] : []),
    ...(input.location ? [`LOCATION:${icsEscape(input.location)}`] : []),
    `ORGANIZER;CN=${icsEscape(input.organizerName)}:mailto:no-reply@harmirecruit.local`,
    `STATUS:${method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED'}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n');
}

// ── Templates ────────────────────────────────────────────────────────

const BRAND_COLOR = '#2563EB';

function shell(title: string, bodyHtml: string, footer?: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f6fb;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:24px auto;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #e6e9f0;">
    <div style="background:${BRAND_COLOR};color:#fff;padding:18px 28px;font-size:18px;font-weight:600;">${title}</div>
    <div style="padding:28px;color:#1f2937;font-size:15px;line-height:1.6;">${bodyHtml}</div>
    <div style="padding:16px 28px;color:#9ca3af;font-size:12px;border-top:1px solid #eef0f5;">
      ${footer || 'Sent by HarmiRecruit — AI-first recruitment platform.'}
    </div>
  </div>
</body></html>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:24px 0;"><a href="${href}" style="background:${BRAND_COLOR};color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;display:inline-block;">${label}</a></p>`;
}

export function passwordResetEmail(resetUrl: string): { subject: string; html: string } {
  return {
    subject: 'Reset your HarmiRecruit password',
    html: shell(
      'Password reset',
      `<p>We received a request to reset your password.</p>
       ${button(resetUrl, 'Reset password')}
       <p>This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>`
    ),
  };
}

export function interviewInviteEmail(input: {
  candidateName: string;
  jobTitle?: string | null;
  companyName: string;
  scheduledAt: Date;
  durationMinutes: number;
  roundType: string;
  joinLink?: string | null;
}): { subject: string; html: string } {
  const when = input.scheduledAt.toLocaleString('en-IN', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  });
  const forJob = input.jobTitle ? ` for the <strong>${input.jobTitle}</strong> position` : '';
  return {
    subject: `Interview scheduled — ${input.jobTitle || input.roundType} (${when})`,
    html: shell(
      'Interview scheduled',
      `<p>Hi ${input.candidateName},</p>
       <p>Your <strong>${input.roundType}</strong> interview${forJob} with <strong>${input.companyName}</strong> has been scheduled.</p>
       <p><strong>When:</strong> ${when} (IST)<br/><strong>Duration:</strong> ${input.durationMinutes} minutes</p>
       ${input.joinLink ? button(input.joinLink, 'Join interview') : ''}
       <p>A calendar invite is attached. Good luck!</p>`
    ),
  };
}

export function interviewCancelledEmail(input: {
  candidateName: string;
  jobTitle?: string | null;
  companyName: string;
  scheduledAt: Date;
}): { subject: string; html: string } {
  const when = input.scheduledAt.toLocaleString('en-IN', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  });
  return {
    subject: `Interview cancelled — ${input.jobTitle || 'your interview'}`,
    html: shell(
      'Interview cancelled',
      `<p>Hi ${input.candidateName},</p>
       <p>Your interview with <strong>${input.companyName}</strong> scheduled for <strong>${when}</strong> (IST) has been cancelled.</p>
       <p>Your recruiter will reach out with next steps.</p>`
    ),
  };
}

export function userInviteEmail(input: {
  name: string;
  workspaceName: string;
  loginUrl: string;
  email: string;
  temporaryPassword?: string;
}): { subject: string; html: string } {
  return {
    subject: `You've been added to ${input.workspaceName} on HarmiRecruit`,
    html: shell(
      `Welcome to ${input.workspaceName}`,
      `<p>Hi ${input.name},</p>
       <p>An account has been created for you on <strong>${input.workspaceName}</strong>'s HarmiRecruit workspace.</p>
       <p><strong>Login email:</strong> ${input.email}${
         input.temporaryPassword
           ? `<br/><strong>Temporary password:</strong> ${input.temporaryPassword} <em>(change it after first login)</em>`
           : ''
       }</p>
       ${button(input.loginUrl, 'Log in')}`
    ),
  };
}

export function applicationReceivedEmail(input: {
  candidateName: string;
  jobTitle: string;
  companyName: string;
}): { subject: string; html: string } {
  return {
    subject: `Application received — ${input.jobTitle}`,
    html: shell(
      'Application received',
      `<p>Hi ${input.candidateName},</p>
       <p>Thanks for applying to <strong>${input.jobTitle}</strong> at <strong>${input.companyName}</strong>.</p>
       <p>Our recruitment team will review your profile and get in touch if there's a match.</p>`
    ),
  };
}
