/** Job sector taxonomy — keep in sync with server/src/services/industries.ts */

export const JOB_INDUSTRIES = [
  'Information Technology',
  'BPO',
  'Insurance',
  'Biotech',
  'Healthcare',
  'Manufacturing',
  'Banking and Finance',
  'Retail',
  'FMCG',
] as const;

export type JobIndustry = (typeof JOB_INDUSTRIES)[number];

const BY_KEY = new Map<string, JobIndustry>(
  JOB_INDUSTRIES.map((name) => [name.toLowerCase(), name])
);

const ALIASES: Record<string, JobIndustry> = {
  it: 'Information Technology',
  'it services': 'Information Technology',
  software: 'Information Technology',
  tech: 'Information Technology',
  technology: 'Information Technology',
  'call center': 'BPO',
  'call centre': 'BPO',
  bpm: 'BPO',
  'customer support': 'BPO',
  ites: 'BPO',
  voice: 'BPO',
  'voice process': 'BPO',
};

export function normalizeIndustry(value: unknown): JobIndustry | null {
  if (typeof value !== 'string') return null;
  const key = value.trim().toLowerCase();
  if (!key) return null;
  return BY_KEY.get(key) ?? ALIASES[key] ?? null;
}

export function isBpoIndustry(value: unknown): boolean {
  return normalizeIndustry(value) === 'BPO';
}

/** Infer sector from free-text title/client when jobs.industry is unset. */
export function inferJobIndustry(job: {
  industry?: string | null;
  title?: string | null;
  client?: string | null;
}): JobIndustry | null {
  const fromField = normalizeIndustry(job.industry);
  if (fromField) return fromField;
  const haystack = `${job.title || ''} ${job.client || ''}`.toLowerCase();
  if (/\b(bpo|bpm|voice process|call centre|call center|customer support|ites)\b/.test(haystack)) {
    return 'BPO';
  }
  if (/\b(software|developer|engineer|data|azure|aws|java|python|react)\b/.test(haystack)) {
    return 'Information Technology';
  }
  return null;
}
