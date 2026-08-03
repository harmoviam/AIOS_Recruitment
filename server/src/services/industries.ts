/**
 * Industry (sector) taxonomy for job openings.
 *
 * This is deliberately separate from `jobs.job_type`, which records the work
 * mode (On-site / Remote / Hybrid). The sector drives screening behaviour:
 * BPO roles get the stay-location + nearby/suggested-companies panels, and
 * every sector gets its own red-flag and screening question wording.
 */

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

/** Sectors whose candidates are screened on commute distance to nearby employers. */
export const LOCATION_SCREENED_INDUSTRIES: JobIndustry[] = ['BPO'];

const BY_KEY = new Map<string, JobIndustry>(
  JOB_INDUSTRIES.map((name) => [name.toLowerCase(), name])
);

// Common spellings recruiters type in free-text imports.
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
  pharma: 'Biotech',
  pharmaceutical: 'Biotech',
  'life sciences': 'Biotech',
  medical: 'Healthcare',
  hospital: 'Healthcare',
  banking: 'Banking and Finance',
  finance: 'Banking and Finance',
  bfsi: 'Banking and Finance',
  'banking & finance': 'Banking and Finance',
  'banking and financial services': 'Banking and Finance',
  ecommerce: 'Retail',
  'e-commerce': 'Retail',
  'consumer goods': 'FMCG',
};

/** Map free-text sector input onto the canonical list; null when unrecognised. */
export function normalizeIndustry(value: unknown): JobIndustry | null {
  if (typeof value !== 'string') return null;
  const key = value.trim().toLowerCase();
  if (!key) return null;
  return BY_KEY.get(key) ?? ALIASES[key] ?? null;
}

export function isBpoIndustry(value: unknown): boolean {
  return normalizeIndustry(value) === 'BPO';
}

/**
 * Sector-specific context injected into screening and red-flag questions so the
 * wording matches what the recruiter is actually hiring for.
 */
export interface IndustryProfile {
  /** Concerns that make a candidate drop out in this sector. */
  attritionDrivers: string[];
  /** What "good" looks like on a first call for this sector. */
  screeningFocus: string[];
  /** Shift/travel reality the recruiter should confirm early. */
  logisticsPrompt: string;
}

const INDUSTRY_PROFILES: Record<JobIndustry, IndustryProfile> = {
  'Information Technology': {
    attritionDrivers: ['counter-offers', 'multiple parallel offers', 'long notice periods'],
    screeningFocus: ['hands-on depth in the primary stack', 'project ownership', 'notice period reality'],
    logisticsPrompt: 'Confirm work mode (on-site / hybrid / remote) and any on-call expectation.',
  },
  BPO: {
    attritionDrivers: ['night shifts', 'commute distance', 'nearby competitor pay', 'family approval'],
    screeningFocus: ['spoken communication', 'shift flexibility', 'commute feasibility', 'voice vs non-voice fit'],
    logisticsPrompt: 'Confirm shift willingness, one-way commute time, and whether transport is required.',
  },
  Insurance: {
    attritionDrivers: ['target pressure', 'commission-heavy pay', 'field travel'],
    screeningFocus: ['sales target history', 'licensing/IRDAI certification', 'comfort with variable pay'],
    logisticsPrompt: 'Confirm field travel radius and comfort with a fixed + variable pay split.',
  },
  Biotech: {
    attritionDrivers: ['lab shift timings', 'relocation to plant locations', 'academia vs industry pull'],
    screeningFocus: ['lab technique depth', 'regulatory/GLP exposure', 'documentation discipline'],
    logisticsPrompt: 'Confirm willingness to relocate to the plant/lab site and work rotational lab shifts.',
  },
  Healthcare: {
    attritionDrivers: ['rotational and night duty', 'registration/licence gaps', 'burnout'],
    screeningFocus: ['clinical registration validity', 'rotational duty acceptance', 'patient-facing experience'],
    logisticsPrompt: 'Confirm registration/licence number validity and acceptance of rotational duty.',
  },
  Manufacturing: {
    attritionDrivers: ['plant location', 'rotational shifts', 'physical shop-floor conditions'],
    screeningFocus: ['shop-floor exposure', 'safety and quality standards', 'shift acceptance'],
    logisticsPrompt: 'Confirm plant-location relocation and rotational/general shift acceptance.',
  },
  'Banking and Finance': {
    attritionDrivers: ['sales targets', 'background-verification failures', 'branch location'],
    screeningFocus: ['product/portfolio handled', 'target achievement record', 'BGV and CIBIL cleanliness'],
    logisticsPrompt: 'Confirm branch/base location and that background verification will be clean.',
  },
  Retail: {
    attritionDrivers: ['weekend and festival working', 'store location', 'standing hours'],
    screeningFocus: ['store/floor experience', 'weekend availability', 'customer handling'],
    logisticsPrompt: 'Confirm weekend/holiday working and the store location they can reach daily.',
  },
  FMCG: {
    attritionDrivers: ['beat/field travel', 'distributor territory changes', 'target pressure'],
    screeningFocus: ['territory and beat coverage', 'distributor handling', 'secondary sales numbers'],
    logisticsPrompt: 'Confirm daily field travel, own two-wheeler availability, and territory coverage.',
  },
};

const GENERIC_PROFILE: IndustryProfile = {
  attritionDrivers: ['competing offers', 'counter-offers', 'unclear joining timeline'],
  screeningFocus: ['relevant experience', 'joining timeline', 'motivation for the role'],
  logisticsPrompt: 'Confirm work location, shift, and joining timeline.',
};

export function industryProfile(value: unknown): IndustryProfile {
  const industry = normalizeIndustry(value);
  return industry ? INDUSTRY_PROFILES[industry] : GENERIC_PROFILE;
}

/** Coarse experience band used to word questions at the right level. */
export type ExperienceBand = 'fresher' | 'junior' | 'mid' | 'senior';

export function experienceBand(years: number | null | undefined): ExperienceBand {
  const y = Number(years);
  if (!Number.isFinite(y) || y < 1) return 'fresher';
  if (y < 3) return 'junior';
  if (y < 8) return 'mid';
  return 'senior';
}

export const EXPERIENCE_BAND_LABELS: Record<ExperienceBand, string> = {
  fresher: 'Fresher (0–1 yrs)',
  junior: 'Junior (1–3 yrs)',
  mid: 'Mid-level (3–8 yrs)',
  senior: 'Senior (8+ yrs)',
};
