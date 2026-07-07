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
  return c.enabled && c.phoneNumberId && c.accessToken ? 'live' : 'simulated';
}

export function verifyWebhookToken(token: string | undefined): boolean {
  const c = cfg();
  return Boolean(c.verifyToken) && token === c.verifyToken;
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
export async function sendWhatsAppText(toPhone: string | null, text: string): Promise<WaSendResult> {
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
        text: { preview_url: false, body: text },
      }),
    });
    const data = (await res.json()) as {
      messages?: { id: string }[];
      error?: { message?: string };
    };
    if (!res.ok) {
      return { simulated: false, delivered: false, error: data.error?.message || `HTTP ${res.status}` };
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
      error?: { message?: string };
    };
    if (!res.ok) {
      return { simulated: false, delivered: false, error: data.error?.message || `HTTP ${res.status}` };
    }
    return { simulated: false, delivered: true, messageId: data.messages?.[0]?.id };
  } catch (err) {
    return { simulated: false, delivered: false, error: (err as Error).message };
  }
}
