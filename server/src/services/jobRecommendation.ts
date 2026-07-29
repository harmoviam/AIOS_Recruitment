import type {
  CandidateMatchProfile,
  JobMatchProfile,
  JobRecommendationDto,
  MatchScoreBreakdown,
  RecommendJobsOptions,
} from '../dto/jobRecommendation.js';
import { haversineDistanceKm } from '../utils/haversine.js';

const ACTIVE_STATUSES = new Set(['active', 'urgent', 'open']);
const REMOTE_KEYWORDS = /\b(remote|wfh|work from home|work-from-home)\b/i;
const HYBRID_KEYWORDS = /\bhybrid\b/i;

export { haversineDistanceKm as calculateDistance };

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normList(items: string[]): string[] {
  return items.map(norm).filter(Boolean);
}

function parseSalaryAmount(value: string | null | undefined): number | null {
  if (!value) return null;
  const s = value.toLowerCase().replace(/,/g, '').replace(/\s+/g, ' ');
  const lpa = s.match(/(\d+(?:\.\d+)?)\s*(?:-\s*(\d+(?:\.\d+)?))?\s*lpa/);
  if (lpa) {
    const low = parseFloat(lpa[1]);
    const high = lpa[2] ? parseFloat(lpa[2]) : low;
    return ((low + high) / 2) * 100000;
  }
  const lakh = s.match(/(\d+(?:\.\d+)?)\s*(?:-\s*(\d+(?:\.\d+)?))?\s*(?:lakh|lac)/);
  if (lakh) {
    const low = parseFloat(lakh[1]);
    const high = lakh[2] ? parseFloat(lakh[2]) : low;
    return ((low + high) / 2) * 100000;
  }
  const plain = s.match(/(\d{5,})/);
  if (plain) return parseInt(plain[1], 10);
  const k = s.match(/(\d+(?:\.\d+)?)\s*k/);
  if (k) return parseFloat(k[1]) * 1000;
  return null;
}

export interface JobEligibility {
  eligible: boolean;
  reason?: 'inactive' | 'age_missing' | 'age' | 'qualification' | 'languages' | 'salary';
}

export function isRemoteJob(job: JobMatchProfile): boolean {
  const blob = [job.location, job.jobType, job.address, job.city].filter(Boolean).join(' ');
  return REMOTE_KEYWORDS.test(blob);
}

function isHybridJob(job: JobMatchProfile): boolean {
  const blob = [job.location, job.jobType, job.address].filter(Boolean).join(' ');
  return HYBRID_KEYWORDS.test(blob);
}

function jobCity(job: JobMatchProfile): string {
  return norm(job.city || job.location || '');
}

function scoreDistance(km: number | null, isRemote: boolean): number {
  if (isRemote) return 30;
  if (km == null) return 10;
  if (km < 5) return 30;
  if (km < 15) return 25;
  if (km < 30) return 20;
  if (km < 50) return 15;
  if (km < 100) return 10;
  return 0;
}

const QUAL_RELEVANCE: Record<string, string[]> = {
  btech: ['be', 'b.e', 'bachelor of technology', 'bachelor of engineering', 'engineering'],
  mtech: ['me', 'm.e', 'master of technology', 'master of engineering'],
  mba: ['master of business administration', 'pgdm'],
  bca: ['bachelor of computer applications'],
  mca: ['master of computer applications'],
  bcom: ['bachelor of commerce'],
  bsc: ['bachelor of science'],
  msc: ['master of science'],
  diploma: ['polytechnic'],
  '12th': ['hsc', 'higher secondary', 'intermediate', 'senior secondary'],
  graduate: ['bachelor', 'b.a', 'ba', 'bcom', 'bsc', 'btech', 'be', 'bca'],
  postgraduate: ['master', 'm.a', 'ma', 'mba', 'mtech', 'me', 'mca', 'msc'],
};

function qualificationTokens(q: string | null): string[] {
  if (!q) return [];
  return norm(q)
    .split(/[,/|&]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function scoreQualification(candidate: CandidateMatchProfile, job: JobMatchProfile): number {
  const required = job.requiredQualification?.trim();
  if (!required) return 20;

  const candQs = [
    candidate.highestQualification,
    ...candidate.education.map((e) => e.degree),
  ]
    .filter(Boolean)
    .map((q) => norm(q!));

  const reqTokens = qualificationTokens(required);
  if (candQs.length === 0) return 0;

  for (const req of reqTokens) {
    for (const cand of candQs) {
      if (cand === req || cand.includes(req) || req.includes(cand)) return 20;
    }
  }

  for (const req of reqTokens) {
    const related = QUAL_RELEVANCE[req] || [];
    for (const cand of candQs) {
      if (related.some((r) => cand.includes(r) || r.includes(cand))) return 15;
      if (req.includes('graduate') && /b\.?tech|b\.?e|bachelor|bca|bsc|bcom|diploma/.test(cand)) return 15;
      if (req.includes('post') && /master|m\.?tech|mba|mca|msc/.test(cand)) return 15;
    }
  }

  for (const req of reqTokens) {
    for (const cand of candQs) {
      const reqWords = req.split(/\s+/);
      const overlap = reqWords.filter((w) => w.length > 2 && cand.includes(w)).length;
      if (overlap >= 1) return 10;
    }
  }

  return 0;
}

function scoreLanguages(candidate: CandidateMatchProfile, job: JobMatchProfile): number {
  const required = normList(job.requiredLanguages);
  if (required.length === 0) return 15;
  const known = normList(candidate.languages);
  if (known.length === 0) return 0;
  const matched = required.filter((r) =>
    known.some((k) => k === r || k.includes(r) || r.includes(k))
  );
  if (matched.length === required.length) return 15;
  if (matched.length > 0) return 8;
  return 0;
}

function scoreSkills(candidate: CandidateMatchProfile, job: JobMatchProfile): number {
  const required = normList(job.requiredSkills);
  if (required.length === 0) return 15;
  const known = normList([...candidate.skills, candidate.specialization || ''].filter(Boolean));
  if (known.length === 0) return 0;
  const matched = required.filter((r) =>
    known.some((k) => k === r || k.includes(r) || r.includes(k))
  );
  if (matched.length === required.length) return 15;
  if (matched.length > 0) return 8;
  return 0;
}

function scoreExperience(candidate: CandidateMatchProfile, job: JobMatchProfile): number {
  const exp = candidate.experienceYears;
  const min = job.minExperience ?? 0;
  const max = job.maxExperience;

  if (max != null && exp >= min && exp <= max) return 10;
  if (max == null && exp >= min) return 10;

  const nearLow = exp >= min - 1 && exp < min;
  const nearHigh = max != null && exp > max && exp <= max + 1;
  if (nearLow || nearHigh) return 5;
  return 0;
}

function scoreSalary(candidate: CandidateMatchProfile, job: JobMatchProfile): number {
  const expected = parseSalaryAmount(candidate.expectedSalary);
  const offered = parseSalaryAmount(job.salary);
  if (expected == null || offered == null) return 5;
  if (offered >= expected) return 5;
  if (offered >= expected * 0.85) return 5;
  if (offered >= expected * 0.6) return 2;
  return 2;
}

function scoreAge(candidate: CandidateMatchProfile, job: JobMatchProfile): number {
  const age = candidate.age;
  if (age == null) return job.minAge == null && job.maxAge == null ? 5 : 0;
  const min = job.minAge;
  const max = job.maxAge;
  if (min == null && max == null) return 5;
  if (min != null && age < min) return 0;
  if (max != null && age > max) return 0;
  return 5;
}

/**
 * Hard eligibility shared by Suggested Companies and Nearby Companies.
 * A required field must be verifiably satisfied; unknown candidate age and
 * unknown offered salary cannot pass a job that constrains those values.
 */
export function evaluateJobEligibility(
  candidate: CandidateMatchProfile,
  job: JobMatchProfile
): JobEligibility {
  if (!ACTIVE_STATUSES.has((job.status || '').toLowerCase())) {
    return { eligible: false, reason: 'inactive' };
  }
  if ((job.minAge != null || job.maxAge != null) && candidate.age == null) {
    return { eligible: false, reason: 'age_missing' };
  }
  if (candidate.age != null) {
    if (job.minAge != null && candidate.age < job.minAge) {
      return { eligible: false, reason: 'age' };
    }
    if (job.maxAge != null && candidate.age > job.maxAge) {
      return { eligible: false, reason: 'age' };
    }
  }
  if (job.requiredQualification && scoreQualification(candidate, job) === 0) {
    return { eligible: false, reason: 'qualification' };
  }
  if (job.requiredLanguages.length > 0 && scoreLanguages(candidate, job) !== 15) {
    return { eligible: false, reason: 'languages' };
  }

  const expectedSalary = parseSalaryAmount(candidate.expectedSalary);
  if (expectedSalary != null) {
    const offeredSalary = parseSalaryAmount(job.salary);
    if (offeredSalary == null || offeredSalary < expectedSalary) {
      return { eligible: false, reason: 'salary' };
    }
  }
  return { eligible: true };
}

function buildReason(breakdown: Omit<MatchScoreBreakdown, 'reason' | 'rejected' | 'rejectionReason'>): string {
  const parts: string[] = [];
  if (breakdown.distance >= 25) parts.push('Excellent Location Match');
  else if (breakdown.distance >= 20) parts.push('Good Location Match');
  else if (breakdown.distance >= 15) parts.push('Fair Location Match');

  if (breakdown.skills >= 15) parts.push('Strong Skills Match');
  else if (breakdown.skills >= 8) parts.push('Partial Skills Match');

  if (breakdown.qualification >= 20) parts.push('Qualification Match');
  else if (breakdown.qualification >= 15) parts.push('Relevant Qualification');

  if (breakdown.languages >= 15) parts.push('Languages Match');
  if (breakdown.experience >= 10) parts.push('Experience In Range');

  return parts.length > 0 ? parts.slice(0, 2).join(' · ') : 'General Profile Match';
}

/**
 * Compute weighted match score (max 100) for a candidate–job pair.
 */
export function calculateMatchScore(
  candidate: CandidateMatchProfile,
  job: JobMatchProfile,
  distanceKm: number | null
): MatchScoreBreakdown {
  const remote = isRemoteJob(job);
  const distanceScore = scoreDistance(distanceKm, remote);
  const qualificationScore = scoreQualification(candidate, job);
  const languagesScore = scoreLanguages(candidate, job);
  const skillsScore = scoreSkills(candidate, job);
  const experienceScore = scoreExperience(candidate, job);
  const salaryScore = scoreSalary(candidate, job);
  const ageScore = scoreAge(candidate, job);

  const breakdown = {
    distance: distanceScore,
    qualification: qualificationScore,
    languages: languagesScore,
    skills: skillsScore,
    experience: experienceScore,
    salary: salaryScore,
    age: ageScore,
    total:
      distanceScore +
      qualificationScore +
      languagesScore +
      skillsScore +
      experienceScore +
      salaryScore +
      ageScore,
  };

  let rejected = false;
  let rejectionReason: string | undefined;
  const eligibility = evaluateJobEligibility(candidate, job);

  if (!eligibility.eligible) {
    rejected = true;
    const reasons: Record<NonNullable<JobEligibility['reason']>, string> = {
      inactive: 'Job is not active',
      age_missing: 'Candidate age is required',
      age: 'Age outside allowed range',
      qualification: 'Required qualification not matched',
      languages: 'All required languages are not matched',
      salary: 'Offered salary is below candidate expectation or unavailable',
    };
    rejectionReason = eligibility.reason ? reasons[eligibility.reason] : 'Candidate is not eligible';
  } else if (
    !remote &&
    distanceKm != null &&
    distanceKm > 100 &&
    !candidate.relocationAllowed
  ) {
    rejected = true;
    rejectionReason = 'Distance exceeds 100 km and candidate is not willing to relocate';
  }

  const reason = buildReason(breakdown);
  return { ...breakdown, reason, rejected, rejectionReason };
}

function jobDistanceKm(candidate: CandidateMatchProfile, job: JobMatchProfile): number | null {
  // Remote work has no physical distance. Keep it null so API consumers do not
  // display the job as being zero kilometres from the candidate.
  if (isRemoteJob(job)) return null;
  if (
    candidate.latitude == null ||
    candidate.longitude == null ||
    job.latitude == null ||
    job.longitude == null
  ) {
    return null;
  }
  return haversineDistanceKm(
    candidate.latitude,
    candidate.longitude,
    job.latitude,
    job.longitude
  );
}

function experienceLabel(job: JobMatchProfile): string | null {
  const min = job.minExperience;
  const max = job.maxExperience;
  if (min != null && max != null) return `${min}–${max} yrs`;
  if (min != null) return `${min}+ yrs`;
  if (max != null) return `Up to ${max} yrs`;
  return null;
}

function passesClientFilters(
  item: JobRecommendationDto,
  job: JobMatchProfile,
  candidate: CandidateMatchProfile,
  opts: RecommendJobsOptions
): boolean {
  if (opts.city) {
    const requiredCity = norm(opts.city);
    const city = jobCity(job);
    if (!city || city !== requiredCity) return false;
  }
  if (opts.maxDistanceKm != null && item.distance != null && item.distance > opts.maxDistanceKm) {
    if (!isRemoteJob(job)) return false;
  }
  if (opts.jobType) {
    const jt = opts.jobType.toLowerCase();
    const jobType = (job.jobType || job.location || '').toLowerCase();
    if (jt === 'remote' && !isRemoteJob(job)) return false;
    if (jt === 'hybrid' && !isHybridJob(job)) return false;
    if (jt === 'wfh' && !isRemoteJob(job)) return false;
    if (!['remote', 'hybrid', 'wfh'].includes(jt) && !jobType.includes(jt)) return false;
  }
  if (opts.fresher && (job.minExperience ?? 0) > 1) return false;
  if (opts.experienced && (job.minExperience ?? 0) < 1) return false;
  return true;
}

function sortRecommendations(
  items: { dto: JobRecommendationDto; job: JobMatchProfile }[],
  sortBy: RecommendJobsOptions['sortBy']
) {
  const mode = sortBy || 'match';
  items.sort((a, b) => {
    if (mode === 'salary') {
      const sa = parseSalaryAmount(a.dto.salary) ?? 0;
      const sb = parseSalaryAmount(b.dto.salary) ?? 0;
      if (sb !== sa) return sb - sa;
    }
    if (a.dto.matchScore !== b.dto.matchScore) return b.dto.matchScore - a.dto.matchScore;
    const da = a.dto.distance ?? 9999;
    const db = b.dto.distance ?? 9999;
    if (da !== db) return da - db;
    const sa = parseSalaryAmount(a.dto.salary) ?? 0;
    const sb = parseSalaryAmount(b.dto.salary) ?? 0;
    return sb - sa;
  });
}

/**
 * Rank active jobs for a candidate using weighted match scoring.
 * Filters inactive jobs first, applies auto-rejection rules, then sorts.
 */
export function recommendJobs(
  candidate: CandidateMatchProfile,
  jobs: JobMatchProfile[],
  options: RecommendJobsOptions = {}
): JobRecommendationDto[] {
  const maxResults = Math.min(options.maxResults ?? 100, 100);
  const activeJobs = jobs.filter((j) => ACTIVE_STATUSES.has((j.status || '').toLowerCase()));

  const scored: { dto: JobRecommendationDto; job: JobMatchProfile }[] = [];

  for (const job of activeJobs) {
    const distance = jobDistanceKm(candidate, job);
    const match = calculateMatchScore(candidate, job, distance);
    if (match.rejected) continue;

    const dto: JobRecommendationDto = {
      id: job.id,
      title: job.title,
      company: job.client,
      distance,
      isRemote: isRemoteJob(job),
      matchScore: match.total,
      salary: job.salary,
      reason: match.reason,
      experience: experienceLabel(job),
      qualification: job.requiredQualification,
      languages: job.requiredLanguages,
      jobType: job.jobType,
      shift: job.shift,
      city: job.city,
      description: job.description,
    };

    if (passesClientFilters(dto, job, candidate, options)) {
      scored.push({ dto, job });
    }
  }

  sortRecommendations(scored, options.sortBy);
  return scored.slice(0, maxResults).map((s) => s.dto);
}

/** Suggest alternative categories when no jobs match. */
export function emptyStateSuggestions(jobs: JobMatchProfile[]): {
  remote: number;
  hybrid: number;
  nearbyCities: string[];
} {
  const remote = jobs.filter((j) => ACTIVE_STATUSES.has(j.status.toLowerCase()) && isRemoteJob(j)).length;
  const hybrid = jobs.filter((j) => ACTIVE_STATUSES.has(j.status.toLowerCase()) && isHybridJob(j)).length;
  const cities = [
    ...new Set(
      jobs
        .filter((j) => ACTIVE_STATUSES.has(j.status.toLowerCase()) && j.city)
        .map((j) => j.city!)
    ),
  ].slice(0, 5);
  return { remote, hybrid, nearbyCities: cities };
}

export function mapCandidateRow(row: Record<string, unknown>): CandidateMatchProfile {
  const langs = row.languages;
  const skills = row.skills;
  const education = row.education;
  const preferredCities = row.preferred_cities;

  return {
    id: Number(row.id),
    tenantId: Number(row.tenant_id),
    latitude: row.latitude != null ? Number(row.latitude) : null,
    longitude: row.longitude != null ? Number(row.longitude) : null,
    currentLocation: (row.current_location as string) || null,
    preferredLocation: (row.preferred_location as string) || null,
    preferredCities: Array.isArray(preferredCities) ? (preferredCities as string[]) : [],
    relocationAllowed: Boolean(row.relocation_allowed),
    age: row.age != null ? Number(row.age) : null,
    gender: (row.gender as string) || null,
    highestQualification: (row.highest_qualification as string) || null,
    specialization: (row.specialization as string) || null,
    languages: Array.isArray(langs) ? (langs as string[]) : [],
    experienceYears: Number(row.experience_years) || 0,
    skills: Array.isArray(skills) ? (skills as string[]) : [],
    expectedSalary: (row.salary_expectation as string) || null,
    preferredJobType: (row.preferred_job_type as string) || null,
    preferredShift: (row.preferred_shift as string) || null,
    noticePeriod: (row.notice_period as string) || null,
    education: Array.isArray(education)
      ? (education as { degree?: string; institution?: string }[])
      : [],
  };
}

export function mapJobRow(row: Record<string, unknown>): JobMatchProfile {
  const reqLangs = row.required_languages;
  const reqSkills = row.required_skills;

  return {
    id: Number(row.id),
    title: String(row.title),
    client: String(row.client),
    status: String(row.status || 'active'),
    latitude: row.latitude != null ? Number(row.latitude) : null,
    longitude: row.longitude != null ? Number(row.longitude) : null,
    address: (row.address as string) || null,
    city: (row.city as string) || null,
    state: (row.state as string) || null,
    country: (row.country as string) || null,
    pincode: (row.pincode as string) || null,
    location: String(row.location || ''),
    requiredQualification: (row.required_qualification as string) || null,
    requiredLanguages: Array.isArray(reqLangs) ? (reqLangs as string[]) : [],
    minAge: row.min_age != null ? Number(row.min_age) : null,
    maxAge: row.max_age != null ? Number(row.max_age) : null,
    minExperience: row.min_experience != null ? Number(row.min_experience) : null,
    maxExperience: row.max_experience != null ? Number(row.max_experience) : null,
    requiredSkills: Array.isArray(reqSkills) ? (reqSkills as string[]) : [],
    salary: (row.salary as string) || null,
    shift: (row.shift as string) || null,
    jobType: (row.job_type as string) || null,
    genderPreference: (row.gender_preference as string) || null,
    openPositions: Number(row.open_positions) || 1,
    description: (row.description as string) || null,
  };
}
