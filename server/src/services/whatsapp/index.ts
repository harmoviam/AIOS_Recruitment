/**
 * WhatsApp integration — public façade over swappable delivery providers.
 *
 * Call sites (candidateMessaging, routes/messages, routes/whatsappWebhook) use
 * only the functions exported here and never learn which provider is active.
 *
 * Providers:
 *  - simulated (default): nothing configured → messages are only stored in the
 *    local `messages` table. Safe for development.
 *  - waha: WAHA_URL set → delivered through a self-hosted WAHA container
 *    driving a QR-paired WhatsApp session. Development and internal testing
 *    only; see ./providers/waha.ts and ./guard.ts.
 *  - meta: WHATSAPP_PHONE_NUMBER_ID + WHATSAPP_ACCESS_TOKEN set → delivered
 *    through the Meta WhatsApp Business Cloud API, with inbound replies and
 *    delivery statuses arriving at /api/whatsapp/webhook.
 *
 * WHATSAPP_PROVIDER overrides the automatic choice — see ./config.ts.
 *
 * Selection is evaluated per call rather than cached, so changing environment
 * variables takes effect without a restart (and tests can vary them freely).
 */
import { selectProviderName, wahaConfig } from './config.js';
import { metaEnabledFlag, metaProvider } from './providers/meta.js';
import { simulatedProvider } from './providers/simulated.js';
import { wahaProvider } from './providers/waha.js';
import type { WhatsAppProvider } from './types.js';

export type { WaSendResult, WhatsAppProvider, WhatsAppProviderStatus } from './types.js';
export type { ProviderName } from './config.js';
export { normalizePhone, withSenderSignature } from './format.js';
export { verifyWebhookToken } from './providers/meta.js';

const PROVIDERS: Record<string, WhatsAppProvider> = {
  meta: metaProvider,
  waha: wahaProvider,
  simulated: simulatedProvider,
};

function activeProvider(): WhatsAppProvider {
  return PROVIDERS[selectProviderName()] ?? simulatedProvider;
}

/** Which backend is actually handling sends right now. */
export function whatsappProvider(): 'meta' | 'waha' | 'simulated' {
  return activeProvider().name;
}

export function whatsappMode(): 'live' | 'simulated' {
  return whatsappProvider() === 'simulated' ? 'simulated' : 'live';
}

/** Safe summary for Settings / inbox — never exposes tokens or secrets. */
export function whatsappIntegrationStatus() {
  const provider = whatsappProvider();
  const meta = metaProvider.status();
  const waha = wahaProvider.status();
  const c = wahaConfig();

  // `configured` stays Meta-shaped for the existing Settings UI contract, and
  // when nothing is configured Settings should still answer "what is missing to
  // go live on Meta?" — so simulated keeps reporting Meta's checklist.
  const active = provider === 'waha' ? waha : meta;

  return {
    mode: whatsappMode(),
    provider,
    enabled: metaEnabledFlag(),
    // WAHA inbound lands on its own route in a later phase; until then the only
    // webhook worth publishing is Meta's.
    webhookPath: '/api/whatsapp/webhook',
    configured: meta.configured,
    ready: active.ready,
    missing: active.missing,
    waha: {
      configured: waha.configured,
      session: c.session,
      allowlistCount: c.allowlist.length,
      ready: waha.ready,
    },
  };
}

/** Verify the active provider can actually reach WhatsApp. */
export function probeWhatsAppAuth(): Promise<{ ok: boolean; error?: string }> {
  return activeProvider().probe();
}

/** Send a free-form text message (allowed inside the 24h customer window). */
export function sendWhatsAppText(
  toPhone: string | null,
  text: string,
  options?: { previewUrl?: boolean }
) {
  return activeProvider().sendText(toPhone, text, options);
}

/**
 * Send a pre-approved template message (required when messaging a candidate
 * outside the 24-hour customer-service window — e.g. automated follow-ups).
 */
export function sendWhatsAppTemplate(
  toPhone: string | null,
  templateName: string,
  languageCode = 'en',
  bodyParams: string[] = []
) {
  return activeProvider().sendTemplate(toPhone, templateName, languageCode, bodyParams);
}
