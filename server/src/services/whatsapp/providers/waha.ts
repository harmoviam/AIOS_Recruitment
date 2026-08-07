/**
 * WAHA provider — https://github.com/devlikeapro/waha
 *
 * A self-hosted container holding a QR-paired WhatsApp session, exposed as a
 * REST API. Free and instant to set up, which makes it the development and
 * internal-testing backend; it is NOT an official WhatsApp API.
 *
 * Consequences worth remembering when a flow works here but fails on Meta:
 *  - there is no 24-hour customer-service window, so any message sends
 *  - there are no approved templates (see sendTemplate below)
 *  - the account can be banned for spam; see ../guard.ts for the rails
 *
 * Local setup: npm run waha:up, then scan the QR from npm run waha:logs.
 */
import { wahaBlockedByProduction, wahaConfig } from '../config.js';
import { normalizePhone } from '../format.js';
import { allowlistRefusal, waitForSendSlot } from '../guard.js';
import type { WaSendResult, WhatsAppProvider, WhatsAppProviderStatus } from '../types.js';

/** "+91 98765 43210" → "919876543210@c.us" (WAHA's individual-chat id form). */
export function toChatId(phone: string): string {
  return `${normalizePhone(phone)}@c.us`;
}

/**
 * WAHA's message id shape varies by engine — NOWEB returns an object, WEBJS a
 * serialized string — so coerce defensively for wa_status bookkeeping.
 */
export function extractMessageId(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const id = (data as { id?: unknown }).id;
  if (typeof id === 'string') return id;
  if (id && typeof id === 'object') {
    const nested = id as { _serialized?: unknown; id?: unknown };
    if (typeof nested._serialized === 'string') return nested._serialized;
    if (typeof nested.id === 'string') return nested.id;
  }
  return undefined;
}

function headers(): Record<string, string> {
  const c = wahaConfig();
  const base: Record<string, string> = { 'Content-Type': 'application/json' };
  if (c.apiKey) base['X-Api-Key'] = c.apiKey;
  return base;
}

/** POST a send request, applying the allowlist and throttle rails first. */
async function guardedSend(toPhone: string, body: Record<string, unknown>): Promise<WaSendResult> {
  const c = wahaConfig();

  const refusal = allowlistRefusal(toPhone, c.allowlist);
  if (refusal) {
    console.warn(`WAHA send refused: ${refusal}`);
    return { simulated: false, delivered: false, error: refusal };
  }

  await waitForSendSlot(c.minSendIntervalMs);

  try {
    const res = await fetch(`${c.url}/api/sendText`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ session: c.session, ...body }),
    });
    const text = await res.text();
    const data: unknown = text ? JSON.parse(text) : {};
    if (!res.ok) {
      const detail =
        (data as { message?: string })?.message || text || `HTTP ${res.status}`;
      console.warn(`WAHA API error (${res.status}): ${detail}`);
      return { simulated: false, delivered: false, error: detail };
    }
    return { simulated: false, delivered: true, messageId: extractMessageId(data) };
  } catch (err) {
    return { simulated: false, delivered: false, error: (err as Error).message };
  }
}

export const wahaProvider: WhatsAppProvider = {
  name: 'waha',

  async sendText(toPhone, text, options): Promise<WaSendResult> {
    if (!toPhone) {
      return { simulated: false, delivered: false, error: 'Candidate has no phone number' };
    }
    return guardedSend(toPhone, {
      chatId: toChatId(toPhone),
      text,
      linkPreview: options?.previewUrl ?? false,
    });
  },

  /**
   * WAHA has no template registry — templates are a Meta Business concept. The
   * body is rendered locally and sent as plain text so development flows still
   * work, but note this exercises none of Meta's template approval, so a flow
   * passing here can still fail in production.
   */
  async sendTemplate(toPhone, templateName, _languageCode, bodyParams): Promise<WaSendResult> {
    if (!toPhone) {
      return { simulated: false, delivered: false, error: 'Candidate has no phone number' };
    }
    console.warn(
      `WAHA has no approved templates — sending "${templateName}" as plain text. Verify against Meta before release.`
    );
    const rendered = bodyParams.length ? `${templateName}: ${bodyParams.join(' ')}` : templateName;
    return guardedSend(toPhone, { chatId: toChatId(toPhone), text: rendered });
  },

  /** The session must exist and be paired before anything can be delivered. */
  async probe(): Promise<{ ok: boolean; error?: string }> {
    const c = wahaConfig();
    try {
      const res = await fetch(`${c.url}/api/sessions/${encodeURIComponent(c.session)}`, {
        headers: headers(),
      });
      if (res.status === 404) {
        return {
          ok: false,
          error: `WAHA session "${c.session}" does not exist — start it with npm run waha:up and scan the QR.`,
        };
      }
      if (!res.ok) return { ok: false, error: `WAHA HTTP ${res.status}` };

      const data = (await res.json()) as { status?: string };
      if (data.status === 'WORKING') return { ok: true };
      if (data.status === 'SCAN_QR_CODE') {
        return {
          ok: false,
          error: 'WAHA session is waiting for a QR scan — run npm run waha:logs and scan it.',
        };
      }
      return { ok: false, error: `WAHA session status is ${data.status ?? 'unknown'}` };
    } catch (err) {
      return { ok: false, error: `WAHA unreachable at ${c.url}: ${(err as Error).message}` };
    }
  },

  status(): WhatsAppProviderStatus {
    const c = wahaConfig();
    return {
      configured: {
        url: Boolean(c.url),
        apiKey: Boolean(c.apiKey),
        allowlist: c.allowlist.length > 0,
      },
      ready: Boolean(c.url) && c.allowlist.length > 0 && !wahaBlockedByProduction(),
      missing: [
        !c.url ? 'WAHA_URL' : null,
        c.allowlist.length === 0 ? 'WAHA_ALLOWLIST (all sends refused until set)' : null,
        wahaBlockedByProduction()
          ? 'WAHA is disabled in production (set WAHA_ALLOW_PRODUCTION=true to override)'
          : null,
      ].filter(Boolean) as string[],
    };
  },
};
