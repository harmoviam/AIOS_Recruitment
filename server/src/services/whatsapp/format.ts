/** Provider-neutral phone and message formatting. */

/** E.164-ish normalization: "+91 98765 43210" → "919876543210". */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/[^\d]/g, '');
  const defaultCountryCode = process.env.WHATSAPP_DEFAULT_COUNTRY_CODE || '91';
  if (phone.trim().startsWith('+')) return digits;
  if (digits.length === 10) return `${defaultCountryCode}${digits}`;
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
export function withSenderSignature(
  text: string,
  senderName: string,
  companyName?: string
): string {
  const identity = companyName ? `${senderName} — ${companyName}` : senderName;
  return `*${identity}:*\n${text}`;
}
