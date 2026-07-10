/**
 * WhatsApp integration — Meta WhatsApp Business Cloud API.
 *
 * Works in two modes, decided by environment variables (see .env.example):
 *
 *  - simulated (default): no env config → messages are only stored in the
 *    local `messages` table, exactly like before. Safe for development.
 *  - live: WHATSAPP_ENABLED=true + credentials set → outgoing messages are
 *    also delivered through the Cloud API, and the /api/whatsapp/webhook
 *    endpoint receives inbound replies + delivery statuses from Meta.
 *
 * Setup process (summary — see README/reply for the full walkthrough):
 *  1. Create a Meta Business + App at developers.facebook.com, add the
 *     "WhatsApp" product.
 *  2. From WhatsApp → API Setup: copy the Phone Number ID and a permanent
 *     access token (System User token with whatsapp_business_messaging).
 *  3. Configure the webhook URL https://<your-domain>/api/whatsapp/webhook
 *     with your WHATSAPP_VERIFY_TOKEN, subscribe to "messages".
 *  4. Fill the WHATSAPP_* variables in .env and restart the server.
 */

export interface WaSendResult {
  simulated: boolean;
  delivered: boolean;
  messageId?: string;
  error?: string;
}

function cfg() {
  return {
    enabled: process.env.WHATSAPP_ENABLED === 'true',
    apiUrl: process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v20.0',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || '',
    defaultCountryCode: process.env.WHATSAPP_DEFAULT_COUNTRY_CODE || '91',
  };
}

export function whatsappMode(): 'live' | 'simulated' {
  const c = cfg();
  // Explicit opt-out only — if phone + token are configured (e.g. via Secret
  // Manager on Cloud Run), treat as live even when WHATSAPP_ENABLED was wiped
  // from env vars by a manual gcloud update.
  if (process.env.WHATSAPP_ENABLED === 'false') return 'simulated';
  return c.phoneNumberId && c.accessToken ? 'live' : 'simulated';
}

/** Safe summary for Settings / inbox — never exposes tokens or secrets. */
export function whatsappIntegrationStatus() {
  const c = cfg();
  const mode = whatsappMode();
  return {
    mode,
    enabled: c.enabled,
    webhookPath: '/api/whatsapp/webhook',
    configured: {
      phoneNumberId: Boolean(c.phoneNumberId),
      accessToken: Boolean(c.accessToken),
      verifyToken: Boolean(c.verifyToken),
    },
    ready: mode === 'live' && Boolean(c.verifyToken),
    missing: [
      process.env.WHATSAPP_ENABLED === 'false' ? 'WHATSAPP_ENABLED=false (disabled)' : null,
      !c.phoneNumberId ? 'WHATSAPP_PHONE_NUMBER_ID' : null,
      !c.accessToken ? 'WHATSAPP_ACCESS_TOKEN' : null,
      !c.verifyToken ? 'WHATSAPP_VERIFY_TOKEN (needed for inbound webhook)' : null,
    ].filter(Boolean) as string[],
  };
}

export function verifyWebhookToken(token: string | undefined): boolean {
  const c = cfg();
  return Boolean(c.verifyToken) && token === c.verifyToken;
}

function formatMetaError(error?: { message?: string; type?: string; code?: number }): string | undefined {
  if (!error?.message) return undefined;
  if (error.message.toLowerCase().includes('authentication')) {
    return 'Authentication Error — regenerate a System User permanent token in Meta Business Manager and update WHATSAPP_ACCESS_TOKEN in Secret Manager.';
  }
  return error.code ? `${error.message} (code ${error.code})` : error.message;
}

/** Verify the configured access token can reach the WhatsApp phone-number API. */
export async function probeWhatsAppAuth(): Promise<{ ok: boolean; error?: string }> {
  if (whatsappMode() !== 'live') return { ok: true };
  const c = cfg();
  try {
    const res = await fetch(`${c.apiUrl}/${c.phoneNumberId}?fields=display_phone_number`, {
      headers: { Authorization: `Bearer ${c.accessToken}` },
    });
    const data = (await res.json()) as { error?: { message?: string; type?: string; code?: number } };
    if (!res.ok) return { ok: false, error: formatMetaError(data.error) || `HTTP ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** E.164-ish normalization: "+91 98765 43210" → "919876543210". */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/[^\d]/g, '');
  const c = cfg();
  if (phone.trim().startsWith('+')) return digits;
  if (digits.length === 10) return `${c.defaultCountryCode}${digits}`;
  return digits;
}

/**
 * Prefix an outbound message with the sending recruiter's identity, since all
 * messages leave from the one shared business number. Uses WhatsApp's *bold*
 * formatting. Example rendered output:
 *
 *   Priya Sharma — AIOS Recruitment:
 *   Hi Rahul, your interview is confirmed for Friday 3pm.
 */
export function withSenderSignature(text: string, senderName: string, companyName?: string): string {
  const identity = companyName ? `${senderName} — ${companyName}` : senderName;
  return `*${identity}:*\n${text}`;
}

/** Send a free-form text message (allowed inside the 24h customer window). */
export async function sendWhatsAppText(
  toPhone: string | null,
  text: string,
  options?: { previewUrl?: boolean }
): Promise<WaSendResult> {
  if (whatsappMode() === 'simulated') return { simulated: true, delivered: false };
  if (!toPhone) return { simulated: false, delivered: false, error: 'Candidate has no phone number' };

  const c = cfg();
  try {
    const res = await fetch(`${c.apiUrl}/${c.phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${c.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: normalizePhone(toPhone),
        type: 'text',
        text: { preview_url: options?.previewUrl ?? false, body: text },
      }),
    });
    const data = (await res.json()) as {
      messages?: { id: string }[];
      error?: { message?: string; type?: string; code?: number };
    };
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

/**
 * Send a pre-approved template message (required when messaging a candidate
 * outside the 24-hour customer-service window — e.g. automated follow-ups).
 */
export async function sendWhatsAppTemplate(
  toPhone: string | null,
  templateName: string,
  languageCode = 'en',
  bodyParams: string[] = []
): Promise<WaSendResult> {
  if (whatsappMode() === 'simulated') return { simulated: true, delivered: false };
  if (!toPhone) return { simulated: false, delivered: false, error: 'Candidate has no phone number' };

  const c = cfg();
  try {
    const res = await fetch(`${c.apiUrl}/${c.phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${c.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: normalizePhone(toPhone),
        type: 'template',
        template: {
          name: templateName,
          language: { code: languageCode },
          components: bodyParams.length
            ? [{ type: 'body', parameters: bodyParams.map((t) => ({ type: 'text', text: t })) }]
            : undefined,
        },
      }),
    });
    const data = (await res.json()) as {
      messages?: { id: string }[];
      error?: { message?: string; type?: string; code?: number };
    };
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
