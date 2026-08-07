import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseAllowlist, selectProviderName, wahaConfig } from '../services/whatsapp/config.js';
import {
  _resetSendThrottleForTests,
  allowlistRefusal,
  isAllowlisted,
} from '../services/whatsapp/guard.js';
import { extractMessageId, toChatId, wahaProvider } from '../services/whatsapp/providers/waha.js';
import {
  probeWhatsAppAuth,
  sendWhatsAppText,
  whatsappIntegrationStatus,
  whatsappMode,
  whatsappProvider,
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

function setEnv(vars: Partial<Record<(typeof WA_ENV)[number], string>>) {
  for (const key of WA_ENV) delete process.env[key];
  for (const [key, value] of Object.entries(vars)) process.env[key] = value;
}

const META = {
  WHATSAPP_PHONE_NUMBER_ID: '123456',
  WHATSAPP_ACCESS_TOKEN: 'tok',
  WHATSAPP_VERIFY_TOKEN: 'verify-me',
};

/** WAHA configured and permitted to message one number, with throttle off. */
const WAHA = {
  WAHA_URL: 'http://localhost:3001',
  WAHA_API_KEY: 'dev-waha-key',
  WAHA_ALLOWLIST: '+91 98765 43210',
  WAHA_MIN_SEND_INTERVAL_MS: '0',
};

beforeEach(() => {
  for (const key of WA_ENV) saved[key] = process.env[key];
  _resetSendThrottleForTests();
});

afterEach(() => {
  for (const key of WA_ENV) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key]!;
  }
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('provider selection', () => {
  it('auto prefers WAHA over Meta when both are configured', () => {
    setEnv({ ...META, ...WAHA });
    expect(selectProviderName()).toBe('waha');
    expect(whatsappProvider()).toBe('waha');
    expect(whatsappMode()).toBe('live');
  });

  it('auto falls through to Meta, then simulated', () => {
    setEnv(META);
    expect(selectProviderName()).toBe('meta');
    setEnv({});
    expect(selectProviderName()).toBe('simulated');
  });

  it('honours an explicit provider choice', () => {
    setEnv({ ...META, ...WAHA, WHATSAPP_PROVIDER: 'meta' });
    expect(selectProviderName()).toBe('meta');
    setEnv({ ...META, ...WAHA, WHATSAPP_PROVIDER: 'simulated' });
    expect(selectProviderName()).toBe('simulated');
  });

  it('falls back to simulated when the forced provider is unconfigured', () => {
    // A typo'd WAHA_URL must not look live while sending nothing.
    setEnv({ WHATSAPP_PROVIDER: 'waha' });
    expect(selectProviderName()).toBe('simulated');
    setEnv({ WHATSAPP_PROVIDER: 'meta' });
    expect(selectProviderName()).toBe('simulated');
  });

  it('ignores an unrecognised WHATSAPP_PROVIDER and auto-selects', () => {
    setEnv({ ...META, WHATSAPP_PROVIDER: 'nonsense' });
    expect(selectProviderName()).toBe('meta');
  });

  it('refuses WAHA in production unless explicitly overridden', () => {
    setEnv({ ...WAHA, ...META, NODE_ENV: 'production' });
    expect(selectProviderName()).toBe('meta');

    setEnv({ ...WAHA, NODE_ENV: 'production' });
    expect(selectProviderName()).toBe('simulated');

    setEnv({ ...WAHA, NODE_ENV: 'production', WAHA_ALLOW_PRODUCTION: 'true' });
    expect(selectProviderName()).toBe('waha');
  });
});

describe('config parsing', () => {
  it('normalizes allowlist entries written in any format', () => {
    expect(parseAllowlist('+91 98765 43210, 9876543210 ,919876543210')).toEqual([
      '919876543210',
      '919876543210',
      '919876543210',
    ]);
  });

  it('treats empty and whitespace-only allowlists as empty', () => {
    expect(parseAllowlist(undefined)).toEqual([]);
    expect(parseAllowlist('  , ,')).toEqual([]);
  });

  it('strips trailing slashes from WAHA_URL', () => {
    setEnv({ WAHA_URL: 'http://localhost:3001///' });
    expect(wahaConfig().url).toBe('http://localhost:3001');
  });

  it('falls back to a safe send interval when the value is garbage', () => {
    setEnv({ WAHA_MIN_SEND_INTERVAL_MS: 'soon' });
    expect(wahaConfig().minSendIntervalMs).toBe(3000);
    setEnv({ WAHA_MIN_SEND_INTERVAL_MS: '-1' });
    expect(wahaConfig().minSendIntervalMs).toBe(3000);
    setEnv({ WAHA_MIN_SEND_INTERVAL_MS: '0' });
    expect(wahaConfig().minSendIntervalMs).toBe(0);
  });
});

describe('allowlist guard', () => {
  it('matches regardless of how the number was written', () => {
    const list = parseAllowlist('+91 98765 43210');
    expect(isAllowlisted('9876543210', list)).toBe(true);
    expect(isAllowlisted('+91 98765 43210', list)).toBe(true);
    expect(isAllowlisted('919876543210', list)).toBe(true);
    expect(isAllowlisted('9123456789', list)).toBe(false);
  });

  it('refuses everything when the allowlist is empty', () => {
    expect(allowlistRefusal('9876543210', [])).toMatch(/refusing all sends/);
  });

  it('names the number it refused', () => {
    expect(allowlistRefusal('9123456789', parseAllowlist('9876543210'))).toBe(
      '919123456789 is not in WAHA_ALLOWLIST — refusing to send.'
    );
  });

  it('permits an allowlisted number', () => {
    expect(allowlistRefusal('9876543210', parseAllowlist('9876543210'))).toBeUndefined();
  });
});

describe('chat id and message id shapes', () => {
  beforeEach(() => setEnv({}));

  it('builds an individual chat id', () => {
    expect(toChatId('+91 98765 43210')).toBe('919876543210@c.us');
    expect(toChatId('9876543210')).toBe('919876543210@c.us');
  });

  it('reads the id across engine response shapes', () => {
    expect(extractMessageId({ id: 'true_919876543210@c.us_ABC' })).toBe(
      'true_919876543210@c.us_ABC'
    );
    expect(extractMessageId({ id: { _serialized: 'serialized-id' } })).toBe('serialized-id');
    expect(extractMessageId({ id: { id: 'nested-id' } })).toBe('nested-id');
    expect(extractMessageId({})).toBeUndefined();
    expect(extractMessageId(null)).toBeUndefined();
  });
});

describe('WAHA sending', () => {
  beforeEach(() => setEnv(WAHA));

  it('refuses a non-allowlisted number without touching the network', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await sendWhatsAppText('9123456789', 'hi');
    expect(result.delivered).toBe(false);
    expect(result.simulated).toBe(false);
    expect(result.error).toMatch(/not in WAHA_ALLOWLIST/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refuses every send when the allowlist is unset', async () => {
    setEnv({ WAHA_URL: 'http://localhost:3001', WAHA_MIN_SEND_INTERVAL_MS: '0' });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await sendWhatsAppText('9876543210', 'hi');
    expect(result.error).toMatch(/refusing all sends/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('posts an allowlisted send to WAHA and returns the message id', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: { _serialized: 'wamid.WAHA' } }), { status: 200 })
    );

    const result = await sendWhatsAppText('9876543210', 'Hi Rahul', { previewUrl: true });
    expect(result).toEqual({ simulated: false, delivered: true, messageId: 'wamid.WAHA' });

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3001/api/sendText');
    expect((init.headers as Record<string, string>)['X-Api-Key']).toBe('dev-waha-key');
    expect(JSON.parse(String(init.body))).toEqual({
      session: 'default',
      chatId: '919876543210@c.us',
      text: 'Hi Rahul',
      linkPreview: true,
    });
  });

  it('surfaces a WAHA error body rather than claiming delivery', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'session not found' }), { status: 422 })
    );
    expect(await sendWhatsAppText('9876543210', 'hi')).toEqual({
      simulated: false,
      delivered: false,
      error: 'session not found',
    });
  });

  it('reports an unreachable container instead of throwing', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await sendWhatsAppText('9876543210', 'hi');
    expect(result.delivered).toBe(false);
    expect(result.error).toBe('ECONNREFUSED');
  });

  it('rejects a candidate with no phone number', async () => {
    expect(await sendWhatsAppText(null, 'hi')).toEqual({
      simulated: false,
      delivered: false,
      error: 'Candidate has no phone number',
    });
  });

  it('sends templates as plain text, since WAHA has no template registry', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ id: 'x' }), { status: 200 }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await wahaProvider.sendTemplate('9876543210', 'interview_reminder', 'en', ['Rahul', '3pm']);
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body)).text).toBe('interview_reminder: Rahul 3pm');
  });
});

describe('WAHA send throttle', () => {
  it('spaces consecutive sends by the configured interval', async () => {
    vi.useFakeTimers();
    setEnv({ ...WAHA, WAHA_MIN_SEND_INTERVAL_MS: '3000' });
    // A Response body can only be read once, so build a fresh one per call.
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () => new Response(JSON.stringify({ id: 'x' }), { status: 200 })
    );

    const first = sendWhatsAppText('9876543210', 'one');
    await vi.advanceTimersByTimeAsync(0);
    expect((await first).delivered).toBe(true);

    let secondSettled = false;
    const second = sendWhatsAppText('9876543210', 'two').then((r) => {
      secondSettled = true;
      return r;
    });

    await vi.advanceTimersByTimeAsync(2000);
    expect(secondSettled).toBe(false);

    await vi.advanceTimersByTimeAsync(1000);
    expect((await second).delivered).toBe(true);
  });
});

describe('WAHA probe', () => {
  beforeEach(() => setEnv(WAHA));

  it('is ok only when the session is WORKING', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ status: 'WORKING' }), { status: 200 })
    );
    expect(await probeWhatsAppAuth()).toEqual({ ok: true });
  });

  it('explains an unscanned QR', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ status: 'SCAN_QR_CODE' }), { status: 200 })
    );
    const result = await probeWhatsAppAuth();
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/waiting for a QR scan/);
  });

  it('explains a missing session', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 404 }));
    const result = await probeWhatsAppAuth();
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/does not exist/);
  });

  it('explains an unreachable container', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await probeWhatsAppAuth();
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/unreachable at http:\/\/localhost:3001/);
  });
});

describe('integration status with WAHA active', () => {
  it('reports the provider and WAHA readiness while keeping the Meta contract', () => {
    setEnv({ ...WAHA, WAHA_SESSION: 'recruiting' });
    const status = whatsappIntegrationStatus();

    expect(status.mode).toBe('live');
    expect(status.provider).toBe('waha');
    expect(status.ready).toBe(true);
    expect(status.missing).toEqual([]);
    // Settings still reads these three keys — they must never go missing.
    expect(status.configured).toEqual({
      phoneNumberId: false,
      accessToken: false,
      verifyToken: false,
    });
    expect(status.waha).toEqual({
      configured: { url: true, apiKey: true, allowlist: true },
      session: 'recruiting',
      allowlistCount: 1,
      ready: true,
    });
  });

  it('is not ready while the allowlist is empty', () => {
    setEnv({ WAHA_URL: 'http://localhost:3001' });
    const status = whatsappIntegrationStatus();
    expect(status.provider).toBe('waha');
    expect(status.ready).toBe(false);
    expect(status.missing).toEqual(['WAHA_ALLOWLIST (all sends refused until set)']);
  });
});
