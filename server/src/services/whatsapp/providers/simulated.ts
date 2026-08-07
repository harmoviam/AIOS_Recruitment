/**
 * No-op provider — the development default.
 *
 * Messages are still written to the local `messages` table by the caller; this
 * provider simply never puts anything on the wire, so nothing reaches a real
 * phone. Selected whenever no delivery backend is configured.
 */
import type { WaSendResult, WhatsAppProvider, WhatsAppProviderStatus } from '../types.js';

const notDelivered: WaSendResult = { simulated: true, delivered: false };

export const simulatedProvider: WhatsAppProvider = {
  name: 'simulated',

  async sendText(): Promise<WaSendResult> {
    return { ...notDelivered };
  },

  async sendTemplate(): Promise<WaSendResult> {
    return { ...notDelivered };
  },

  /** Nothing to reach, so nothing can be unreachable. */
  async probe(): Promise<{ ok: boolean; error?: string }> {
    return { ok: true };
  },

  status(): WhatsAppProviderStatus {
    return { configured: {}, missing: [], ready: false };
  },
};
