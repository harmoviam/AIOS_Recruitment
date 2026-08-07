import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  normalizePhone,
  probeWhatsAppAuth,
  sendWhatsAppText,
  verifyWebhookToken,
  whatsappIntegrationStatus,
  whatsappMode,
  withSenderSignature,
} from '../services/whatsapp/index.js';

const WA_ENV = [
  'WHATSAPP_ENABLED',
  'WHATSAPP_PROVIDER',
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_VERIFY_TOKEN',
  'WHATSAPP_DEFAULT_COUNTRY_CODE',
  'WAHA_URL',
  'WAHA_API_KEY',
  'WAHA_SESSION',
  'WAHA_ALLOWLIST',
  'WAHA_MIN_SEND_INTERVAL_MS',
  'WAHA_ALLOW_PRODUCTION',
  'NODE_ENV',
] as const;

const saved: Record<string, string | undefined> = {};

/** Configure Meta credentials; omit a key to leave it unset. */
function setEnv(vars: Partial<Record<(typeof WA_ENV)[number], string>>) {
  for (const key of WA_ENV) delete process.env[key];
  for (const [key, value] of Object.entries(vars)) process.env[key] = value;
}

const metaCreds = {
  WHATSAPP_PHONE_NUMBER_ID: '123456',
  WHATSAPP_ACCESS_TOKEN: 'tok',
  WHATSAPP_VERIFY_TOKEN: 'verify-me',
};

beforeEach(() => {
  for (const key of WA_ENV) saved[key] = process.env[key];
});

afterEach(() => {
  for (const key of WA_ENV) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key]!;
  }
});

describe('provider selection', () => {
  it('falls back to simulated with no credentials', () => {
    setEnv({});
    expect(whatsappMode()).toBe('simulated');
  });

  it('goes live once phone number id and access token are present', () => {
    setEnv(metaCreds);
    expect(whatsappMode()).toBe('live');
  });

  it('stays live when WHATSAPP_ENABLED is absent but credentials are set', () => {
    // Cloud Run: a manual gcloud update can wipe the flag without dropping the
    // Secret Manager values — credentials alone must keep delivery on.
    setEnv(metaCreds);
    expect(whatsappMode()).toBe('live');
  });

  it('treats WHATSAPP_ENABLED=false as an explicit opt-out', () => {
    setEnv({ ...metaCreds, WHATSAPP_ENABLED: 'false' });
    expect(whatsappMode()).toBe('simulated');
  });

  it('needs both credentials, not just one', () => {
    setEnv({ WHATSAPP_PHONE_NUMBER_ID: '123456' });
    expect(whatsappMode()).toBe('simulated');
    setEnv({ WHATSAPP_ACCESS_TOKEN: 'tok' });
    expect(whatsappMode()).toBe('simulated');
  });
});

describe('simulated provider', () => {
  beforeEach(() => setEnv({}));

  it('never delivers and never errors', async () => {
    expect(await sendWhatsAppText('+919876543210', 'hi')).toEqual({
      simulated: true,
      delivered: false,
    });
  });

  it('reports simulated rather than an error for a candidate with no phone', async () => {
    expect(await sendWhatsAppText(null, 'hi')).toEqual({ simulated: true, delivered: false });
  });

  it('probes ok — there is nothing to be unreachable', async () => {
    expect(await probeWhatsAppAuth()).toEqual({ ok: true });
  });
});

describe('live provider guards', () => {
  it('rejects a candidate with no phone number', async () => {
    setEnv(metaCreds);
    expect(await sendWhatsAppText(null, 'hi')).toEqual({
      simulated: false,
      delivered: false,
      error: 'Candidate has no phone number',
    });
  });
});

describe('whatsappIntegrationStatus', () => {
  it('lists every missing credential when nothing is configured', () => {
    setEnv({});
    expect(whatsappIntegrationStatus()).toEqual({
      mode: 'simulated',
      provider: 'simulated',
      enabled: false,
      webhookPath: '/api/whatsapp/webhook',
      configured: { phoneNumberId: false, accessToken: false, verifyToken: false },
      ready: false,
      missing: [
        'WHATSAPP_PHONE_NUMBER_ID',
        'WHATSAPP_ACCESS_TOKEN',
        'WHATSAPP_VERIFY_TOKEN (needed for inbound webhook)',
      ],
      waha: {
        configured: { url: false, apiKey: false, allowlist: false },
        session: 'default',
        allowlistCount: 0,
        ready: false,
      },
    });
  });

  it('is ready only when the verify token backs the send credentials', () => {
    setEnv({ WHATSAPP_PHONE_NUMBER_ID: '123456', WHATSAPP_ACCESS_TOKEN: 'tok' });
    const status = whatsappIntegrationStatus();
    expect(status.mode).toBe('live');
    expect(status.ready).toBe(false);
    expect(status.missing).toEqual(['WHATSAPP_VERIFY_TOKEN (needed for inbound webhook)']);

    setEnv({ ...metaCreds, WHATSAPP_ENABLED: 'true' });
    expect(whatsappIntegrationStatus()).toMatchObject({ ready: true, enabled: true, missing: [] });
  });

  it('leads with the disabled reason when opted out', () => {
    setEnv({ ...metaCreds, WHATSAPP_ENABLED: 'false' });
    const status = whatsappIntegrationStatus();
    expect(status.mode).toBe('simulated');
    expect(status.ready).toBe(false);
    // Credentials still report as configured so Settings can show what exists.
    expect(status.configured).toEqual({
      phoneNumberId: true,
      accessToken: true,
      verifyToken: true,
    });
    expect(status.missing).toEqual(['WHATSAPP_ENABLED=false (disabled)']);
  });
});

describe('verifyWebhookToken', () => {
  it('matches the configured token', () => {
    setEnv(metaCreds);
    expect(verifyWebhookToken('verify-me')).toBe(true);
    expect(verifyWebhookToken('wrong')).toBe(false);
    expect(verifyWebhookToken(undefined)).toBe(false);
  });

  it('never matches when no token is configured', () => {
    setEnv({});
    expect(verifyWebhookToken('')).toBe(false);
    expect(verifyWebhookToken(undefined)).toBe(false);
  });
});

describe('normalizePhone', () => {
  beforeEach(() => setEnv({}));

  it('strips punctuation from an international number', () => {
    expect(normalizePhone('+91 98765 43210')).toBe('919876543210');
  });

  it('prefixes the default country code onto a bare 10-digit number', () => {
    expect(normalizePhone('9876543210')).toBe('919876543210');
  });

  it('honours WHATSAPP_DEFAULT_COUNTRY_CODE', () => {
    setEnv({ WHATSAPP_DEFAULT_COUNTRY_CODE: '44' });
    expect(normalizePhone('9876543210')).toBe('449876543210');
  });

  it('leaves other lengths alone', () => {
    expect(normalizePhone('09876543210')).toBe('09876543210');
  });
});

describe('withSenderSignature', () => {
  it('includes the company when present', () => {
    expect(withSenderSignature('Hi Rahul', 'Priya Sharma', 'AIOS Recruitment')).toBe(
      '*Priya Sharma — AIOS Recruitment:*\nHi Rahul'
    );
  });

  it('falls back to the sender alone', () => {
    expect(withSenderSignature('Hi Rahul', 'Priya Sharma')).toBe('*Priya Sharma:*\nHi Rahul');
  });
});
