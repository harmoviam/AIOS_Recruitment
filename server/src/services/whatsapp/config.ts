/**
 * Provider selection and WAHA configuration.
 *
 * WHATSAPP_PROVIDER picks the delivery backend:
 *   auto (default) — WAHA if configured, else Meta if configured, else simulated
 *   waha | meta    — force that provider; falls back to simulated when it is
 *                    not configured, so a typo can never silently send nothing
 *                    while claiming to be live
 *   simulated      — force local-only, even with credentials present
 */
import { normalizePhone } from './format.js';
import { metaConfigured } from './providers/meta.js';

export type ProviderName = 'meta' | 'waha' | 'simulated';

const PROVIDER_NAMES: readonly string[] = ['meta', 'waha', 'simulated'];

const DEFAULT_MIN_SEND_INTERVAL_MS = 3000;

export function requestedProvider(): ProviderName | 'auto' {
  const raw = (process.env.WHATSAPP_PROVIDER || 'auto').trim().toLowerCase();
  return PROVIDER_NAMES.includes(raw) ? (raw as ProviderName) : 'auto';
}

function intEnv(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/**
 * Split a comma-separated allowlist into normalized numbers. Entries go through
 * the same normalizePhone as outbound sends, so "+91 98765 43210", "9876543210"
 * and "919876543210" all match the same candidate.
 */
export function parseAllowlist(raw: string | undefined): string[] {
  return (raw || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map(normalizePhone);
}

export interface WahaConfig {
  url: string;
  apiKey: string;
  session: string;
  webhookSecret: string;
  /** Normalized numbers WAHA is permitted to message. Empty = refuse all. */
  allowlist: string[];
  minSendIntervalMs: number;
  allowProduction: boolean;
}

export function wahaConfig(): WahaConfig {
  return {
    url: (process.env.WAHA_URL || '').replace(/\/+$/, ''),
    apiKey: process.env.WAHA_API_KEY || '',
    session: process.env.WAHA_SESSION || 'default',
    webhookSecret: process.env.WAHA_WEBHOOK_SECRET || '',
    allowlist: parseAllowlist(process.env.WAHA_ALLOWLIST),
    minSendIntervalMs: intEnv(
      process.env.WAHA_MIN_SEND_INTERVAL_MS,
      DEFAULT_MIN_SEND_INTERVAL_MS
    ),
    allowProduction: process.env.WAHA_ALLOW_PRODUCTION === 'true',
  };
}

export function wahaConfigured(): boolean {
  return Boolean(wahaConfig().url);
}

/**
 * WAHA drives an unofficial WhatsApp session and can get the number banned, so
 * it is refused in production unless explicitly overridden.
 */
export function wahaBlockedByProduction(): boolean {
  return process.env.NODE_ENV === 'production' && !wahaConfig().allowProduction;
}

export function selectProviderName(): ProviderName {
  const requested = requestedProvider();
  const wahaUsable = wahaConfigured() && !wahaBlockedByProduction();

  if (requested === 'simulated') return 'simulated';
  if (requested === 'waha') return wahaUsable ? 'waha' : 'simulated';
  if (requested === 'meta') return metaConfigured() ? 'meta' : 'simulated';

  if (wahaUsable) return 'waha';
  if (metaConfigured()) return 'meta';
  return 'simulated';
}
