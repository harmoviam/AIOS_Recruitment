/**
 * Meta WhatsApp Business Cloud API provider.
 *
 * Setup process (summary — see .env.example for the full walkthrough):
 *  1. Create a Meta Business + App at developers.facebook.com, add the
 *     "WhatsApp" product.
 *  2. From WhatsApp → API Setup: copy the Phone Number ID and a permanent
 *     access token (System User token with whatsapp_business_messaging).
 *  3. Configure the webhook URL https://<your-domain>/api/whatsapp/webhook
 *     with your WHATSAPP_VERIFY_TOKEN, subscribe to "messages".
 *  4. Fill the WHATSAPP_* variables in .env and restart the server.
 */
import { normalizePhone } from '../format.js';
import type { WaSendResult, WhatsAppProvider, WhatsAppProviderStatus } from '../types.js';

function cfg() {
  return {
    enabled: process.env.WHATSAPP_ENABLED === 'true',
    apiUrl: process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v20.0',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || '',
  };
}

/**
 * True when Meta can actually send. Explicit opt-out only — if phone + token
 * are configured (e.g. via Secret Manager on Cloud Run), treat as usable even
 * when WHATSAPP_ENABLED was wiped from env vars by a manual gcloud update.
 */
export function metaConfigured(): boolean {
  if (process.env.WHATSAPP_ENABLED === 'false') return false;
  const c = cfg();
  return Boolean(c.phoneNumberId && c.accessToken);
}

/** Whether WHATSAPP_ENABLED is explicitly set to 'true'. Surfaced in Settings. */
export function metaEnabledFlag(): boolean {
  return cfg().enabled;
}

export function verifyWebhookToken(token: string | undefined): boolean {
  const c = cfg();
  return Boolean(c.verifyToken) && token === c.verifyToken;
}

function formatMetaError(error?: {
  message?: string;
  type?: string;
  code?: number;
}): string | undefined {
  if (!error?.message) return undefined;
  if (error.message.toLowerCase().includes('authentication')) {
    return 'Authentication Error — regenerate a System User permanent token in Meta Business Manager and update WHATSAPP_ACCESS_TOKEN in Secret Manager.';
  }
  return error.code ? `${error.message} (code ${error.code})` : error.message;
}

interface MetaSendResponse {
  messages?: { id: string }[];
  error?: { message?: string; type?: string; code?: number };
}

/** Shared POST /{phoneNumberId}/messages plumbing for text and template sends. */
async function postMessage(body: Record<string, unknown>): Promise<WaSendResult> {
  const c = cfg();
  try {
    const res = await fetch(`${c.apiUrl}/${c.phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${c.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messaging_product: 'whatsapp', ...body }),
    });
    const data = (await res.json()) as MetaSendResponse;
    if (!res.ok) {
      const detail = formatMetaError(data.error) || `HTTP ${res.status}`;
      console.warn(`WhatsApp API error (${res.status}): ${detail}`);
      return { simulated: false, delivered: false, error: detail };
    }
    return { simulated: false, delivered: true, messageId: data.messages?.[0]?.id };
  } catch (err) {
    return { simulated: false, delivered: false, error: (err as Error).message };
  }
}

export const metaProvider: WhatsAppProvider = {
  name: 'meta',

  /** Send a free-form text message (allowed inside the 24h customer window). */
  async sendText(toPhone, text, options): Promise<WaSendResult> {
    if (!toPhone) {
      return { simulated: false, delivered: false, error: 'Candidate has no phone number' };
    }
    return postMessage({
      to: normalizePhone(toPhone),
      type: 'text',
      text: { preview_url: options?.previewUrl ?? false, body: text },
    });
  },

  /**
   * Send a pre-approved template message (required when messaging a candidate
   * outside the 24-hour customer-service window — e.g. automated follow-ups).
   */
  async sendTemplate(toPhone, templateName, languageCode, bodyParams): Promise<WaSendResult> {
    if (!toPhone) {
      return { simulated: false, delivered: false, error: 'Candidate has no phone number' };
    }
    return postMessage({
      to: normalizePhone(toPhone),
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        components: bodyParams.length
          ? [{ type: 'body', parameters: bodyParams.map((t) => ({ type: 'text', text: t })) }]
          : undefined,
      },
    });
  },

  /** Verify the configured access token can reach the WhatsApp phone-number API. */
  async probe(): Promise<{ ok: boolean; error?: string }> {
    const c = cfg();
    try {
      const res = await fetch(`${c.apiUrl}/${c.phoneNumberId}?fields=display_phone_number`, {
        headers: { Authorization: `Bearer ${c.accessToken}` },
      });
      const data = (await res.json()) as {
        error?: { message?: string; type?: string; code?: number };
      };
      if (!res.ok) return { ok: false, error: formatMetaError(data.error) || `HTTP ${res.status}` };
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  },

  status(): WhatsAppProviderStatus {
    const c = cfg();
    return {
      configured: {
        phoneNumberId: Boolean(c.phoneNumberId),
        accessToken: Boolean(c.accessToken),
        verifyToken: Boolean(c.verifyToken),
      },
      // Inbound replies need the verify token on top of send credentials.
      ready: metaConfigured() && Boolean(c.verifyToken),
      missing: [
        process.env.WHATSAPP_ENABLED === 'false' ? 'WHATSAPP_ENABLED=false (disabled)' : null,
        !c.phoneNumberId ? 'WHATSAPP_PHONE_NUMBER_ID' : null,
        !c.accessToken ? 'WHATSAPP_ACCESS_TOKEN' : null,
        !c.verifyToken ? 'WHATSAPP_VERIFY_TOKEN (needed for inbound webhook)' : null,
      ].filter(Boolean) as string[],
    };
  },
};
