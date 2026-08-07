/** Result of an outbound WhatsApp send, shared by every provider. */
export interface WaSendResult {
  simulated: boolean;
  delivered: boolean;
  messageId?: string;
  error?: string;
}

/** Readiness summary a provider reports to Settings — never contains secrets. */
export interface WhatsAppProviderStatus {
  /** Per-credential booleans, e.g. { phoneNumberId: true, accessToken: false }. */
  configured: Record<string, boolean>;
  /** Human-readable names of what is still missing, in display order. */
  missing: string[];
  /** True when this provider is fully operational (send + inbound). */
  ready: boolean;
}

/**
 * A WhatsApp delivery backend. Implementations live in ./providers and are
 * selected at call time by ./index.ts, so no call site knows which is active.
 */
export interface WhatsAppProvider {
  readonly name: 'meta' | 'waha' | 'simulated';
  sendText(
    toPhone: string | null,
    text: string,
    options?: { previewUrl?: boolean }
  ): Promise<WaSendResult>;
  sendTemplate(
    toPhone: string | null,
    templateName: string,
    languageCode: string,
    bodyParams: string[]
  ): Promise<WaSendResult>;
  /** Cheap liveness check — credentials valid / session paired. */
  probe(): Promise<{ ok: boolean; error?: string }>;
  status(): WhatsAppProviderStatus;
}
