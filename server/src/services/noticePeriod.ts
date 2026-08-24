export const NOTICE_PERIOD_OPTIONS = [
  'Immediate',
  'Within 15 Days',
  'Within 30 Days',
  'Within 45 Days',
  'Within 60 Days',
  'Within 90 Days',
] as const;

export type NoticePeriod = (typeof NOTICE_PERIOD_OPTIONS)[number];

/** Convert parser/user variants such as "30 days" into the supported values. */
export function normalizeNoticePeriod(value: unknown): NoticePeriod | null {
  if (value == null || String(value).trim() === '') return null;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'immediate' || normalized === 'immediately' || normalized === 'available immediately') {
    return 'Immediate';
  }
  const days = normalized.match(/\b(15|30|45|60|90)\b/)?.[1];
  return days ? (`Within ${days} Days` as NoticePeriod) : null;
}

