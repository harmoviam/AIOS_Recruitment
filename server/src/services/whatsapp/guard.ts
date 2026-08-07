/**
 * Send-safety rails for the WAHA provider.
 *
 * WAHA drives a real, personal WhatsApp account. A stray loop during testing
 * both spams real candidates and gets the number banned, so outbound sends are
 * restricted to an explicit allowlist and spaced apart in time.
 *
 * The allowlist defaults to refuse-all: starting WAHA without configuring
 * WAHA_ALLOWLIST produces clean per-message errors in the inbox rather than
 * live messages to whoever happens to be in the candidates table.
 */
import { normalizePhone } from './format.js';

export function isAllowlisted(phone: string, allowlist: string[]): boolean {
  return allowlist.includes(normalizePhone(phone));
}

/**
 * Returns an error string when the send must be refused, or undefined when it
 * may proceed.
 */
export function allowlistRefusal(phone: string, allowlist: string[]): string | undefined {
  if (allowlist.length === 0) {
    return 'WAHA_ALLOWLIST is empty — refusing all sends. Add the test number(s) to WAHA_ALLOWLIST to enable sending.';
  }
  if (!isAllowlisted(phone, allowlist)) {
    return `${normalizePhone(phone)} is not in WAHA_ALLOWLIST — refusing to send.`;
  }
  return undefined;
}

let lastSendAt = 0;
let chain: Promise<void> = Promise.resolve();

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Serialize outbound sends and space them by at least minIntervalMs. Callers
 * queue behind each other, so a burst of sends drains at a steady rate instead
 * of hitting WhatsApp all at once.
 */
export function waitForSendSlot(minIntervalMs: number): Promise<void> {
  const run = chain.then(async () => {
    if (minIntervalMs > 0) {
      const wait = lastSendAt + minIntervalMs - Date.now();
      if (wait > 0) await sleep(wait);
    }
    lastSendAt = Date.now();
  });
  // Keep the chain alive even if a caller's send rejects downstream.
  chain = run.catch(() => {});
  return run;
}

/** Tests only — forget the last send time so spacing starts fresh. */
export function _resetSendThrottleForTests(): void {
  lastSendAt = 0;
  chain = Promise.resolve();
}
