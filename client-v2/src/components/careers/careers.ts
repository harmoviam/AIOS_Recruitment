/**
 * Careers page shared utilities.
 *
 * Everything display-related is derived from the real API payloads and this
 * config (Indian city catalogue used purely as navigation affordances). No
 * invented jobs, salaries, or stats live here.
 */

import type { PublicJob } from '../../types';

/* ─────────────────────────── Cities & states ─────────────────────────── */

export interface CityOption {
  city: string;
  state: string;
}

/**
 * Curated catalogue of popular Indian cities used for discoverability chips
 * and the "Explore jobs by city" grid. Navigation affordance only — job
 * counts always come from the live API. Extra cities can be added here (or
 * surfaced automatically from the backend via the /jobs/meta endpoint).
 */
export const POPULAR_CITIES: CityOption[] = [
  { city: 'Delhi NCR', state: 'Delhi' },
  { city: 'Chandigarh', state: 'Chandigarh' },
  { city: 'Ludhiana', state: 'Punjab' },
  { city: 'Amritsar', state: 'Punjab' },
  { city: 'Mohali', state: 'Punjab' },
  { city: 'Jalandhar', state: 'Punjab' },
  { city: 'Pathankot', state: 'Punjab' },
  { city: 'Hoshiarpur', state: 'Punjab' },
  { city: 'Bengaluru', state: 'Karnataka' },
  { city: 'Hyderabad', state: 'Telangana' },
  { city: 'Chennai', state: 'Tamil Nadu' },
  { city: 'Mumbai', state: 'Maharashtra' },
  { city: 'Pune', state: 'Maharashtra' },
  { city: 'Ahmedabad', state: 'Gujarat' },
  { city: 'Jaipur', state: 'Rajasthan' },
  { city: 'Kolkata', state: 'West Bengal' },
  { city: 'Lucknow', state: 'Uttar Pradesh' },
  { city: 'Noida', state: 'Uttar Pradesh' },
  { city: 'Gurugram', state: 'Haryana' },
  { city: 'Indore', state: 'Madhya Pradesh' },
];

export const INDIAN_STATES = [
  'Andhra Pradesh',
  'Assam',
  'Bihar',
  'Chandigarh',
  'Chhattisgarh',
  'Delhi',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jammu and Kashmir',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Odisha',
  'Puducherry',
  'Punjab',
  'Rajasthan',
  'Tamil Nadu',
  'Telangana',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
] as const;

/** Fold raw city strings into a canonical bucket for matching. */
const CITY_ALIASES: Record<string, string> = {
  bangalore: 'Bengaluru',
  bengaluru: 'Bengaluru',
  banglore: 'Bengaluru',
  benguluru: 'Bengaluru',
  'new delhi': 'Delhi NCR',
  'delhi ncr': 'Delhi NCR',
  delhi: 'Delhi NCR',
  gurgaon: 'Gurugram',
  gurugram: 'Gurugram',
  gurgoan: 'Gurugram',
  'sahibzada ajit singh nagar': 'Mohali',
  kharar: 'Mohali',
  'chandigarh tricity': 'Chandigarh',
  'mohali/ludhiana': 'Ludhiana',
};

const STATE_ALIASES: Record<string, string> = {
  'uttar pradesh': 'Uttar Pradesh',
};

export function canonicalCity(raw: string | null | undefined): string {
  const cleaned = (raw || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\s*-\s*\d{6}$/i, '')
    .replace(/,.*$/, '');
  if (!cleaned) return '';
  const broad = cleaned.replace(/[^a-z0-9 ]/gi, '').toLowerCase();
  return CITY_ALIASES[broad] || CITY_ALIASES[cleaned.toLowerCase()] || cleaned;
}

export function canonicalState(raw: string | null | undefined): string {
  const cleaned = (raw || '').trim();
  if (!cleaned) return '';
  return STATE_ALIASES[cleaned.toLowerCase()] || cleaned;
}

/** The canonical city a job belongs to (falls back to first part of location). */
export function jobCity(job: PublicJob): string {
  if (job.city) {
    const c = canonicalCity(job.city);
    if (c) return c;
  }
  return canonicalCity(job.location);
}

/** True when the job's city/state/location matches the given city or its aliases. */
export function jobMatchesCity(job: PublicJob, city: string): boolean {
  const target = canonicalCity(city);
  if (!target) return false;
  const choices = [jobCity(job), canonicalCity(job.state), job.state, job.location];
  return choices.some((value) => {
    const c = canonicalCity(value);
    if (!c) return false;
    if (c === target) return true;
    // e.g. "Bengaluru, Karnataka" contains "Bengaluru"
    return `${value}`.toLowerCase().includes(target.toLowerCase());
  });
}

/* ─────────────────────────── Job derived fields ─────────────────────────── */

export const EMPLOYMENT_TYPES = ['Full Time', 'Part Time', 'Contract', 'Internship', 'Temporary'];

/** Best-effort employment type from the free-text job_type column. */
export function employmentType(job: PublicJob): string | null {
  if (!job.job_type) return null;
  const t = job.job_type.trim();
  for (const e of EMPLOYMENT_TYPES) {
    if (t.toLowerCase() === e.toLowerCase()) return e;
  }
  if (t.toLowerCase() === 'fulltime') return 'Full Time';
  return null;
}

/** Best-effort work mode from job_type (used when the value is a mode, not a type). */
export function workMode(job: PublicJob): string | null {
  if (!job.job_type) return null;
  const t = job.job_type.trim();
  const lower = t.toLowerCase();
  if (['remote', 'wfh', 'work from home'].includes(lower)) return 'Remote';
  if (lower === 'hybrid') return 'Hybrid';
  if (lower === 'onsite' || lower === 'on-site') return 'On-Site';
  if (lower === 'field') return 'Field';
  if (lower.includes('remote')) return 'Remote';
  if (lower === 'full time' || lower === 'fulltime') {
    if (/remote|wfh|hybrid/i.test(job.location)) return /remote|wfh/i.test(job.location) ? 'Remote' : 'Hybrid';
    return 'On-Site';
  }
  return null;
}

export function jobSkills(job: PublicJob): string[] {
  return Array.isArray(job.required_skills) ? job.required_skills.filter((s) => typeof s === 'string' && s.trim()) : [];
}

/* ─────────────────────────── Formatting ─────────────────────────── */

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/** Format a number with Indian digit grouping. */
export function formatIndianNumber(value: number): string {
  return inr.format(Math.round(value));
}

export interface SalaryInfo {
  minLpa: number | null;
  maxLpa: number | null;
  isMonthly: boolean;
  label: string | null;
}

function extractNumbers(text: string): { minRaw: number; maxRaw: number } | null {
  const matches = text.match(/[\d.,]+/g);
  if (!matches) return null;
  const numbers = matches.map((m) => Number(m.replace(/,/g, ''))).filter((n) => Number.isFinite(n) && n > 0);
  if (numbers.length === 0) return null;
  return { minRaw: Math.min(...numbers), maxRaw: Math.max(...numbers) };
}

function lpaLabel(min: number, max: number, isMonthly: boolean): string {
  if (isMonthly) {
    return `₹${formatIndianNumber(min)} – ₹${formatIndianNumber(max)}/month`;
  }
  const fmt = (n: number) => (n >= 100 ? `${Math.round(n)}` : n.toFixed(1).replace(/\.0$/, ''));
  return min === max ? `₹${fmt(min)} LPA` : `₹${fmt(min)} – ₹${fmt(max)} LPA`;
}

/**
 * Parse the free-text salary column into LPA bounds + a display label.
 * Tolerant of "INR 10-18 LPA", "4.2 LPA", "₹ 913,920 - 1,468,800",
 * "₹16,000 – ₹20,000/month", "₹2.5 - 4 LPA", etc. Returns null-label when
 * unparseable (UI then hides salary).
 */
export function parseSalary(raw: string | null | undefined): SalaryInfo {
  if (!raw) return { minLpa: null, maxLpa: null, isMonthly: false, label: null };
  const text = raw.trim();
  if (!text || /^\s*$/.test(text)) return { minLpa: null, maxLpa: null, isMonthly: false, label: null };
  const nums = extractNumbers(text);
  if (!nums) return { minLpa: null, maxLpa: null, isMonthly: false, label: null };

  const lower = text.toLowerCase();
  let isMonthly = false;

  if (lower.includes('lpa') || lower.includes('lakh') || lower.includes('lac') || /per\s*annum|pa\b|annual/.test(lower)) {
    // numbers are already LPA
  } else if (/month|per\s*mon|\/month|pm\b/i.test(lower)) {
    isMonthly = true;
  } else if (nums.maxRaw >= 500000) {
    // large figure -> annual rupees
  } else if (nums.minRaw < 20000) {
    // small-ish figure with no unit -> treat as monthly (common for Indian roles)
    isMonthly = true;
  }

  const minLpa = isMonthly ? (nums.minRaw * 12) / 100000 : nums.minRaw >= 500000 ? nums.minRaw / 100000 : nums.minRaw;
  const maxLpa = isMonthly ? (nums.maxRaw * 12) / 100000 : nums.maxRaw >= 500000 ? nums.maxRaw / 100000 : nums.maxRaw;

  return {
    minLpa,
    maxLpa,
    isMonthly,
    label: lpaLabel(minLpa, maxLpa, isMonthly),
  };
}

/** Reads the current local date — used by "posted X days ago". */
export function formatPosted(dateIso: string): string {
  const then = new Date(dateIso);
  if (Number.isNaN(then.getTime())) return '';
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(then)) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.round(days / 30)} months ago`;
  return `${Math.round(days / 365)} years ago`;
}

export function formatOpenings(count: number): string {
  if (count <= 1) return '';
  return `${count} openings`;
}

export function formatExperience(min: number | null, max: number | null): string | null {
  if ((min == null || min === 0) && (max == null || max === 0)) return 'Freshers welcome';
  if (min != null && max != null) return min === max ? `${min} yrs` : `${min} – ${max} yrs`;
  if (min != null) return `${min}+ yrs`;
  if (max != null) return `Up to ${max} yrs`;
  return null;
}

/* ─────────────────────────── Search & relevance ─────────────────────────── */

/** Normalize text for forgiving search (case, whitespace, punctuation). */
export function normalizeSearch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function searchableText(job: PublicJob): string {
  return normalizeSearch(
    [
      job.title,
      job.client,
      job.location,
      job.city,
      job.state,
      job.industry,
      job.required_skills?.join(' '),
      job.shift,
      job.job_type,
    ].join(' ')
  );
}

/** Score 0..100 so results can be ordered by relevance when a query is active. */
export function relevanceScore(job: PublicJob, query: string): number {
  const q = normalizeSearch(query);
  if (!q) return 0;
  const title = normalizeSearch(job.title);
  const skills = normalizeSearch(job.required_skills?.join(' ') || '');
  const industry = normalizeSearch(job.industry || '');
  const location = normalizeSearch([job.location, job.city, job.state].filter(Boolean).join(' '));
  const client = normalizeSearch(job.client || '');
  let score = 0;
  if (title === q) score = 100;
  else if (title.includes(q)) score = 90;
  else if (title.split(' ').some((w) => w === q)) score = 70;
  if (q.length >= 3) {
    if (skills.includes(q)) score = Math.max(score, 75);
    if (industry.includes(q)) score = Math.max(score, 60);
    if (location.includes(q)) score = Math.max(score, 55);
    if (client.includes(q)) score = Math.max(score, 45);
  }
  return score;
}

/* ─────────────────────────── Filters & sort ─────────────────────────── */

export type SortKey = 'recent' | 'relevance' | 'salary_high' | 'salary_low';

export interface Filters {
  cities: string[];
  states: string[];
  industries: string[];
  employment: string[];
  workModes: string[];
  skills: string[];
  experienceBucket: string;
  salaryBucket: string;
  postedBucket: string;
}

export const EMPTY_FILTERS: Filters = {
  cities: [],
  states: [],
  industries: [],
  employment: [],
  workModes: [],
  skills: [],
  experienceBucket: '',
  salaryBucket: '',
  postedBucket: '',
};

export const EXPERIENCE_BUCKETS: { value: string; label: string }[] = [
  { value: 'fresher', label: 'Fresher' },
  { value: '1-3', label: '1 – 3 years' },
  { value: '3-5', label: '3 – 5 years' },
  { value: '5-10', label: '5 – 10 years' },
  { value: '10+', label: '10+ years' },
];

export const SALARY_BUCKETS: { value: string; label: string }[] = [
  { value: 'lt2', label: 'Under ₹2 LPA' },
  { value: '2-5', label: '₹2 – 5 LPA' },
  { value: '5-10', label: '₹5 – 10 LPA' },
  { value: '10-20', label: '₹10 – 20 LPA' },
  { value: 'gt20', label: 'Above ₹20 LPA' },
];

export const POSTED_BUCKETS: { value: string; label: string }[] = [
  { value: '1d', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
];

function matchesExperience(job: PublicJob, bucket: string): boolean {
  if (!bucket) return true;
  const min = job.min_experience ?? 0;
  const max = job.max_experience ?? min;
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  switch (bucket) {
    case 'fresher': return lo <= 0 && hi <= 1;
    case '1-3': return hi >= 0 && lo <= 3;
    case '3-5': return hi >= 3 && lo <= 5;
    case '5-10': return hi >= 5 && lo <= 10;
    case '10+': return hi >= 10 || min >= 10;
    default: return true;
  }
}

function matchesSalary(job: PublicJob, bucket: string): boolean {
  if (!bucket) return true;
  const { minLpa, maxLpa } = parseSalary(job.salary);
  const lo = minLpa ?? 0;
  const hi = maxLpa ?? lo;
  switch (bucket) {
    case 'lt2': return hi < 2;
    case '2-5': return hi >= 2 && lo <= 5;
    case '5-10': return hi >= 5 && lo <= 10;
    case '10-20': return hi >= 10 && lo <= 20;
    case 'gt20': return hi >= 20;
    default: return true;
  }
}

function daysSince(dateIso: string): number {
  const then = new Date(dateIso).getTime();
  if (Number.isNaN(then)) return Infinity;
  return (Date.now() - then) / 86400000;
}

function matchesPosted(job: PublicJob, bucket: string): boolean {
  if (!bucket) return true;
  const days = daysSince(job.created_at);
  switch (bucket) {
    case '1d': return days <= 1;
    case '7d': return days <= 7;
    case '30d': return days <= 30;
    case '90d': return days <= 90;
    default: return true;
  }
}

export function filterJobs(jobs: PublicJob[], filters: Filters, query: string): PublicJob[] {
  const q = normalizeSearch(query);
  const queryTerms = q ? q.split(' ') : [];
  return jobs.filter((job) => {
    const text = searchableText(job);
    if (q) {
      if (!text.includes(q)) {
        if (!queryTerms.every((term) => text.includes(term))) return false;
      }
    }
    if (filters.cities.length && !filters.cities.some((c) => jobMatchesCity(job, c))) return false;
    if (filters.states.length && !filters.states.includes(canonicalState(job.state))) return false;
    if (filters.industries.length && !filters.industries.includes(job.industry ?? '')) return false;
    if (filters.employment.length) {
      const type = employmentType(job);
      if (!type || !filters.employment.includes(type)) return false;
    }
    if (filters.workModes.length) {
      const mode = workMode(job);
      if (!mode || !filters.workModes.includes(mode)) return false;
    }
    if (filters.skills.length) {
      const skills = jobSkills(job).map((s) => normalizeSearch(s));
      if (!filters.skills.every((skill) => skills.some((s) => s.includes(normalizeSearch(skill)) || normalizeSearch(skill).includes(s)))) return false;
    }
    if (filters.experienceBucket && !matchesExperience(job, filters.experienceBucket)) return false;
    if (filters.salaryBucket && !matchesSalary(job, filters.salaryBucket)) return false;
    if (filters.postedBucket && !matchesPosted(job, filters.postedBucket)) return false;
    return true;
  });
}

export function sortJobs(jobs: PublicJob[], sort: SortKey, query: string): PublicJob[] {
  const list = [...jobs];
  switch (sort) {
    case 'recent':
      return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    case 'relevance': {
      const scored = list.map((j) => ({ j, s: relevanceScore(j, query) }));
      scored.sort((a, b) => b.s - a.s || new Date(b.j.created_at).getTime() - new Date(a.j.created_at).getTime());
      return scored.map((x) => x.j);
    }
    case 'salary_high':
      return list.sort((a, b) => (parseSalary(b.salary).maxLpa ?? -1) - (parseSalary(a.salary).maxLpa ?? -1));
    case 'salary_low':
      return list.sort((a, b) => (parseSalary(a.salary).minLpa ?? Infinity) - (parseSalary(b.salary).minLpa ?? Infinity));
    default:
      return list;
  }
}

/** True when any salary is parseable — used to enable salary sorting. */
export function hasSalaryData(jobs: PublicJob[]): boolean {
  return jobs.some((j) => parseSalary(j.salary).label != null);
}

export function activeFilterCount(filters: Filters): number {
  return (
    filters.cities.length +
    filters.states.length +
    filters.industries.length +
    filters.employment.length +
    filters.workModes.length +
    filters.skills.length +
    (filters.experienceBucket ? 1 : 0) +
    (filters.salaryBucket ? 1 : 0) +
    (filters.postedBucket ? 1 : 0)
  );
}

/** Read a comma-separated value list value from a query param. */
export function parseParamList(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}