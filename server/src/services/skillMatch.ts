/**
 * Flexible skill matching for eligibility + ATS JD keyword scoring.
 *
 * Layers (first hit wins):
 *  1. Exact / substring on normalized text
 *  2. Alias / synonym expansion (e.g. Synapse ↔ Azure Synapse Analytics)
 *  3. Core-token match — vendor/filler words dropped; remaining distinctive
 *     tokens must all appear (so "Synapse" matches "Azure Synapse Analytics")
 */

const SKILL_STOPWORDS = new Set([
  'azure',
  'aws',
  'amazon',
  'google',
  'gcp',
  'microsoft',
  'oracle',
  'ibm',
  'cloud',
  'suite',
  'platform',
  'service',
  'services',
  'analytics',
  'analysis',
  'framework',
  'library',
  'tool',
  'tools',
  'software',
  'system',
  'systems',
  'technology',
  'technologies',
  'tech',
  'solution',
  'solutions',
  'data',
  'management',
  'development',
  'developer',
  'engineering',
  'engineer',
  'studio',
  'server',
  'web',
  'app',
  'application',
  'applications',
  'enterprise',
  'open',
  'source',
]);

/**
 * Canonical skill → aliases (and reverse is applied automatically).
 * Keep entries lowercase; matching normalizes input.
 */
const SKILL_ALIAS_GROUPS: string[][] = [
  ['azure synapse analytics', 'azure synapse', 'synapse analytics', 'synapse'],
  ['azure data factory', 'adf', 'data factory'],
  ['azure databricks', 'databricks'],
  ['azure devops', 'ado', 'azure boards'],
  ['power bi', 'powerbi', 'microsoft power bi'],
  ['sql server', 'mssql', 'microsoft sql server', 't-sql', 'tsql'],
  ['postgresql', 'postgres', 'psql'],
  ['mongodb', 'mongo'],
  ['kubernetes', 'k8s'],
  ['javascript', 'js', 'ecmascript'],
  ['typescript', 'ts'],
  ['node.js', 'nodejs', 'node'],
  ['react.js', 'reactjs', 'react'],
  ['next.js', 'nextjs'],
  ['vue.js', 'vuejs', 'vue'],
  ['amazon redshift', 'redshift'],
  ['amazon s3', 'aws s3', 's3'],
  ['google bigquery', 'bigquery', 'bq'],
  ['apache spark', 'spark'],
  ['apache kafka', 'kafka'],
  ['apache airflow', 'airflow'],
  ['machine learning', 'ml'],
  ['artificial intelligence', 'ai'],
  ['ci/cd', 'cicd', 'continuous integration', 'continuous delivery'],
  ['dot net', '.net', 'dotnet', 'asp.net', 'aspnet'],
  ['c sharp', 'c#', 'csharp'],
  ['c plus plus', 'c++', 'cpp'],
];

function buildAliasMap(): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const group of SKILL_ALIAS_GROUPS) {
    const normalized = group.map(normalizeSkill).filter(Boolean);
    const set = new Set(normalized);
    for (const key of normalized) {
      const existing = map.get(key) || new Set<string>();
      for (const a of set) existing.add(a);
      map.set(key, existing);
    }
  }
  return map;
}

const ALIAS_MAP = buildAliasMap();

export function normalizeSkill(value: string): string {
  return value
    .toLowerCase()
    .replace(/c\+\+/g, 'c plus plus')
    .replace(/c#/g, 'c sharp')
    .replace(/\.net/g, 'dot net')
    .replace(/node\.js/g, 'nodejs')
    .replace(/[^a-z0-9+#.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(value: string): string[] {
  return normalizeSkill(value)
    .split(' ')
    .map((t) => t.trim())
    .filter(Boolean);
}

/** Distinctive tokens after dropping vendor/filler words. */
export function coreSkillTokens(skill: string): string[] {
  const all = tokens(skill);
  const core = all.filter((t) => t.length >= 3 && !SKILL_STOPWORDS.has(t));
  // If everything was a stopword (e.g. "Cloud"), fall back to longest tokens.
  if (core.length === 0) {
    return all.filter((t) => t.length >= 3);
  }
  return core;
}

function aliasesFor(skill: string): string[] {
  const n = normalizeSkill(skill);
  const fromMap = ALIAS_MAP.get(n);
  if (fromMap) return [...fromMap];
  return [n];
}

function haystackHasPhrase(haystack: string, phrase: string): boolean {
  if (!phrase) return false;
  if (haystack.includes(phrase)) return true;
  // Word-boundary-ish: prefer whole-token presence for short aliases (js, ts, s3)
  if (phrase.length <= 3) {
    return new RegExp(`(?:^|\\s)${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`).test(
      ` ${haystack} `
    );
  }
  return false;
}

function haystackHasAllTokens(haystack: string, toks: string[]): boolean {
  if (toks.length === 0) return false;
  const padded = ` ${haystack} `;
  return toks.every((t) => {
    if (t.length <= 2) {
      return new RegExp(`(?:^|\\s)${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`).test(padded);
    }
    return haystack.includes(t);
  });
}

export type SkillMatchMethod = 'exact' | 'alias' | 'core_token';

export interface SkillMatchDetail {
  skill: string;
  matched: boolean;
  method?: SkillMatchMethod;
}

/**
 * Returns true when the required skill is evidenced in candidate skills + resume text.
 */
export function skillMatchesHaystack(requiredSkill: string, haystackNormalized: string): boolean {
  return matchSkillAgainstHaystack(requiredSkill, haystackNormalized).matched;
}

export function matchSkillAgainstHaystack(
  requiredSkill: string,
  haystackNormalized: string
): SkillMatchDetail {
  const needle = normalizeSkill(requiredSkill);
  if (!needle) return { skill: requiredSkill, matched: false };

  // 1. Exact / substring on full required skill
  if (haystackHasPhrase(haystackNormalized, needle)) {
    return { skill: requiredSkill, matched: true, method: 'exact' };
  }

  // 2. Alias expansion
  for (const alias of aliasesFor(requiredSkill)) {
    if (alias === needle) continue;
    if (haystackHasPhrase(haystackNormalized, alias)) {
      return { skill: requiredSkill, matched: true, method: 'alias' };
    }
  }

  // 3. Core-token match (Azure Synapse Analytics → synapse)
  const core = coreSkillTokens(requiredSkill);
  if (core.length > 0 && haystackHasAllTokens(haystackNormalized, core)) {
    return { skill: requiredSkill, matched: true, method: 'core_token' };
  }

  return { skill: requiredSkill, matched: false };
}

export function buildSkillHaystack(parts: Array<string | null | undefined>): string {
  return normalizeSkill(parts.filter(Boolean).join(' '));
}

export function matchSkillList(
  required: string[],
  haystackNormalized: string
): { matched: string[]; missing: string[]; details: SkillMatchDetail[]; rate: number } {
  if (required.length === 0) {
    return { matched: [], missing: [], details: [], rate: 1 };
  }
  const details = required.map((skill) => matchSkillAgainstHaystack(skill, haystackNormalized));
  const matched = details.filter((d) => d.matched).map((d) => d.skill);
  const missing = details.filter((d) => !d.matched).map((d) => d.skill);
  const total = matched.length + missing.length;
  const rate = total === 0 ? 1 : matched.length / total;
  return { matched, missing, details, rate };
}
