import type { ParsedProfile } from './ai.js';
import { buildSkillHaystack, matchSkillList } from './skillMatch.js';

/**
 * ATS score for an uploaded resume — 0-100, computed right after parsing.
 *
 * This scores the *resume*: how completely it parses, how well-structured it is,
 * and how closely it matches the job it is being submitted to. It is deliberately
 * deterministic (no AI call) so the same file always scores the same, and so the
 * upload path stays fast.
 *
 * Not to be confused with `ai_score`, the 0-10 role-fit judgement.
 */

export interface AtsCategoryScore {
  key: string;
  label: string;
  score: number;
  max: number;
  /** Why the category scored what it did. */
  detail: string;
}

export interface AtsScoreResult {
  /** 0-100, one decimal. */
  score: number;
  grade: 'Excellent' | 'Good' | 'Average' | 'Poor';
  categories: AtsCategoryScore[];
  /** Things the resume is missing that ATS parsers commonly need. */
  missing: string[];
  /** Concrete fixes, highest impact first. */
  recommendations: string[];
  /** JD keywords found / not found, when scored against a job. */
  matched_keywords: string[];
  missing_keywords: string[];
  scored_against_job: boolean;
  computed_at: string;
}

export interface AtsJobContext {
  title?: string | null;
  required_skills?: string[] | null;
  required_qualification?: string | null;
  min_experience?: number | null;
}

/** Section headers an ATS looks for when segmenting a resume. */
const EXPECTED_SECTIONS: Array<{ key: string; label: string; pattern: RegExp }> = [
  { key: 'experience', label: 'Experience', pattern: /\b(work experience|professional experience|employment|experience)\b/i },
  { key: 'education', label: 'Education', pattern: /\b(education|academic|qualification)\b/i },
  { key: 'skills', label: 'Skills', pattern: /\b(skills|technical skills|competenc)/i },
  { key: 'summary', label: 'Summary', pattern: /\b(summary|profile|objective|about me)\b/i },
];

function clamp(value: number, max: number): number {
  return Math.max(0, Math.min(max, value));
}

function normalizeKeyword(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9+#.]+/g, ' ').trim();
}

function hasDates(profile: ParsedProfile): boolean {
  return (profile.experience || []).some((e) => Boolean(e.start_date || e.end_date));
}

function scoreContact(profile: ParsedProfile): AtsCategoryScore {
  const present: string[] = [];
  const absent: string[] = [];
  const check = (label: string, value: unknown) => {
    if (typeof value === 'string' && value.trim()) present.push(label);
    else absent.push(label);
  };
  check('name', profile.name);
  check('email', profile.email);
  check('phone', profile.phone);
  check('location', profile.current_location);
  // A professional link is a bonus rather than a requirement.
  const hasLink = [profile.linkedin, profile.github, profile.portfolio].some(
    (v) => typeof v === 'string' && v.trim()
  );

  const score = clamp(present.length * 3 + (hasLink ? 3 : 0), 15);
  return {
    key: 'contact',
    label: 'Contact details',
    score,
    max: 15,
    detail: absent.length
      ? `Missing: ${absent.join(', ')}${hasLink ? '' : '; no LinkedIn/GitHub/portfolio link'}.`
      : hasLink
        ? 'Name, email, phone, location and a professional link all present.'
        : 'Contact block complete; add a LinkedIn or portfolio link.',
  };
}

function scoreSummary(profile: ParsedProfile): AtsCategoryScore {
  const summary = profile.professional_summary?.trim() || '';
  const words = summary ? summary.split(/\s+/).length : 0;
  let score = 0;
  let detail: string;
  if (!summary) {
    detail = 'No professional summary — recruiters and ATS keyword matching both rely on it.';
  } else if (words < 20) {
    score = 5;
    detail = `Summary is only ${words} words; aim for 40-80 words naming role, years, and core skills.`;
  } else if (words <= 120) {
    score = 10;
    detail = `Clear ${words}-word summary.`;
  } else {
    score = 7;
    detail = `Summary is ${words} words — trim to under 120 so the key claims stand out.`;
  }
  return { key: 'summary', label: 'Professional summary', score, max: 10, detail };
}

function scoreSkills(profile: ParsedProfile): AtsCategoryScore {
  const skills = new Set(
    [...(profile.technical_skills || []), ...(profile.skills || [])]
      .map((s) => normalizeKeyword(String(s)))
      .filter(Boolean)
  );
  const count = skills.size;
  let score: number;
  let detail: string;
  if (count === 0) {
    score = 0;
    detail = 'No skills section detected — add an explicit, comma-separated skills list.';
  } else if (count < 5) {
    score = 6;
    detail = `Only ${count} skills listed; ATS keyword matching needs 8-15.`;
  } else if (count < 8) {
    score = 11;
    detail = `${count} skills listed; a few more named tools would help keyword matching.`;
  } else {
    score = 15;
    detail = `${count} skills listed — good keyword coverage.`;
  }
  return { key: 'skills', label: 'Skills coverage', score, max: 15, detail };
}

function scoreExperience(profile: ParsedProfile): AtsCategoryScore {
  const experience = profile.experience || [];
  const years = profile.total_experience_years ?? null;
  if (!experience.length) {
    return {
      key: 'experience',
      label: 'Work experience',
      score: years && years > 0 ? 5 : 2,
      max: 20,
      detail: 'No structured work history parsed — list each role as Title, Company, and dates on separate lines.',
    };
  }

  const withCompany = experience.filter((e) => e.company?.trim()).length;
  const withTitle = experience.filter((e) => e.title?.trim()).length;
  const withDescription = experience.filter((e) => e.description?.trim()).length;
  const dated = hasDates(profile);

  // Judge on how completely each role is described, not on how many roles there
  // are — one well-documented long tenure is not a weaker resume than five stubs.
  let score = 8;
  score += (withCompany / experience.length) * 4;
  score += (withTitle / experience.length) * 3;
  score += (withDescription / experience.length) * 3;
  score += dated ? 2 : 0;
  score = clamp(Math.round(score * 10) / 10, 20);

  const gaps: string[] = [];
  if (withCompany < experience.length) gaps.push('some roles have no company');
  if (withTitle < experience.length) gaps.push('some roles have no job title');
  if (!withDescription) gaps.push('no bullet points describing what was done');
  if (!dated) gaps.push('no start/end dates');

  return {
    key: 'experience',
    label: 'Work experience',
    score,
    max: 20,
    detail: gaps.length
      ? `${experience.length} role(s) parsed, but ${gaps.join('; ')}.`
      : `${experience.length} role(s) parsed with titles, companies, dates, and detail.`,
  };
}

function scoreEducation(profile: ParsedProfile): AtsCategoryScore {
  const education = profile.education || [];
  if (!education.length) {
    return {
      key: 'education',
      label: 'Education',
      score: 0,
      max: 10,
      detail: 'No education section parsed — add degree, institution, and year.',
    };
  }
  const withYear = education.filter((e) => e.year?.toString().trim()).length;
  const withInstitution = education.filter((e) => e.institution?.trim()).length;
  const score = clamp(5 + (withInstitution ? 3 : 0) + (withYear ? 2 : 0), 10);
  return {
    key: 'education',
    label: 'Education',
    score,
    max: 10,
    detail: withYear
      ? `${education.length} qualification(s) with institution and year.`
      : `${education.length} qualification(s), but no passing year — add it.`,
  };
}

function scoreParseability(profile: ParsedProfile, resumeText: string): AtsCategoryScore {
  const text = resumeText || '';
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const sectionsFound = EXPECTED_SECTIONS.filter((s) => s.pattern.test(text));

  let score = 0;
  const notes: string[] = [];

  // Extractable text volume: an image-only PDF yields almost nothing.
  if (words >= 250) score += 7;
  else if (words >= 120) {
    score += 4;
    notes.push(`only ${words} words of text extracted — the file may be image-heavy`);
  } else {
    notes.push(`only ${words} words of text extracted — likely a scanned or image-based file`);
  }

  score += Math.min(6, sectionsFound.length * 1.5);
  const missingSections = EXPECTED_SECTIONS.filter((s) => !sectionsFound.includes(s));
  if (missingSections.length) {
    notes.push(`no clear ${missingSections.map((s) => s.label).join('/')} heading`);
  }

  // Parser confidence reflects how cleanly the profile came out.
  score += clamp((profile.confidence ?? 0) * 2, 2);

  return {
    key: 'parseability',
    label: 'ATS parseability',
    score: clamp(Math.round(score * 10) / 10, 15),
    max: 15,
    detail: notes.length
      ? `Standard headings and selectable text matter: ${notes.join('; ')}.`
      : 'Clean text extraction with standard section headings.',
  };
}

function scoreJobMatch(
  profile: ParsedProfile,
  resumeText: string,
  job: AtsJobContext | null
): { category: AtsCategoryScore; matched: string[]; missing: string[] } {
  const required = (job?.required_skills || []).map(String).filter((s) => s.trim());

  if (!job || !required.length) {
    // Nothing to match against — award the weight so unassigned resumes are not
    // penalised for a job that was never selected.
    return {
      category: {
        key: 'job_match',
        label: 'JD keyword match',
        score: 15,
        max: 15,
        detail: job
          ? 'No required skills recorded on the job — add them to score keyword match.'
          : 'Not submitted to a job yet — score this again after assigning a role.',
      },
      matched: [],
      missing: [],
    };
  }

  const haystack = buildSkillHaystack([
    resumeText,
    profile.professional_summary || '',
    ...(profile.skills || []),
    ...(profile.technical_skills || []),
    ...(profile.experience || []).map((e) => `${e.title || ''} ${e.description || ''}`),
  ]);

  const { matched, missing } = matchSkillList(required, haystack);

  const ratio = matched.length / required.length;
  return {
    category: {
      key: 'job_match',
      label: 'JD keyword match',
      score: Math.round(ratio * 15 * 10) / 10,
      max: 15,
      detail: `${matched.length} of ${required.length} required skills found in the resume.`,
    },
    matched,
    missing,
  };
}

function gradeFor(score: number): AtsScoreResult['grade'] {
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Average';
  return 'Poor';
}

/**
 * Score a parsed resume out of 100. Pass the job the candidate is being
 * submitted to so JD keywords are part of the score.
 */
export function computeAtsScore(
  profile: ParsedProfile,
  resumeText: string,
  job: AtsJobContext | null = null
): AtsScoreResult {
  const jobMatch = scoreJobMatch(profile, resumeText, job);
  const categories: AtsCategoryScore[] = [
    scoreContact(profile),
    scoreSummary(profile),
    scoreSkills(profile),
    scoreExperience(profile),
    scoreEducation(profile),
    scoreParseability(profile, resumeText),
    jobMatch.category,
  ];

  const total = categories.reduce((sum, c) => sum + c.score, 0);
  const score = Math.round(clamp(total, 100) * 10) / 10;

  const missing: string[] = [];
  if (!profile.email?.trim()) missing.push('Email address');
  if (!profile.phone?.trim()) missing.push('Phone number');
  if (!profile.current_location?.trim()) missing.push('Current location');
  if (!profile.professional_summary?.trim()) missing.push('Professional summary');
  if (!(profile.skills?.length || profile.technical_skills?.length)) missing.push('Skills section');
  if (!profile.education?.length) missing.push('Education section');
  if (!profile.experience?.length) missing.push('Structured work history');
  if (profile.experience?.length && !hasDates(profile)) missing.push('Employment dates');

  // Weakest categories first — those are the highest-impact fixes.
  const recommendations = categories
    .filter((c) => c.score < c.max)
    .sort((a, b) => b.max - b.score - (a.max - a.score))
    .slice(0, 4)
    .map((c) => c.detail);

  if (jobMatch.missing.length) {
    recommendations.unshift(
      `Add or evidence these JD skills if the candidate has them: ${jobMatch.missing.slice(0, 8).join(', ')}.`
    );
  }

  return {
    score,
    grade: gradeFor(score),
    categories,
    missing,
    recommendations,
    matched_keywords: jobMatch.matched,
    missing_keywords: jobMatch.missing,
    scored_against_job: Boolean(job && (job.required_skills || []).length),
    computed_at: new Date().toISOString(),
  };
}
