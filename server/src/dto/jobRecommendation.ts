/** Candidate profile used by the recommendation engine. */
export interface CandidateMatchProfile {
  id: number;
  tenantId: number;
  latitude: number | null;
  longitude: number | null;
  currentLocation: string | null;
  preferredLocation: string | null;
  preferredCities: string[];
  relocationAllowed: boolean;
  age: number | null;
  gender: string | null;
  highestQualification: string | null;
  specialization: string | null;
  languages: string[];
  experienceYears: number;
  skills: string[];
  expectedSalary: string | null;
  preferredJobType: string | null;
  preferredShift: string | null;
  noticePeriod: string | null;
  education: { degree?: string; institution?: string }[];
}

/** Active job row enriched for scoring. */
export interface JobMatchProfile {
  id: number;
  title: string;
  client: string;
  status: string;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  pincode: string | null;
  location: string;
  requiredQualification: string | null;
  requiredLanguages: string[];
  minAge: number | null;
  maxAge: number | null;
  minExperience: number | null;
  maxExperience: number | null;
  requiredSkills: string[];
  salary: string | null;
  shift: string | null;
  jobType: string | null;
  genderPreference: string | null;
  openPositions: number;
  description: string | null;
}

/** API response item for GET /api/jobs/recommend/:candidateId */
export interface JobRecommendationDto {
  id: number;
  title: string;
  company: string;
  distance: number | null;
  isRemote: boolean;
  matchScore: number;
  salary: string | null;
  reason: string;
  experience: string | null;
  qualification: string | null;
  languages: string[];
  jobType: string | null;
  shift: string | null;
  city: string | null;
  description: string | null;
}

export interface RecommendJobsOptions {
  maxResults?: number;
  /** Max distance filter in km (client-side filter). */
  maxDistanceKm?: number | null;
  /** Restrict on-site/hybrid recommendations to the assigned job's city. */
  city?: string | null;
  jobType?: string | null;
  sortBy?: 'match' | 'salary' | 'distance';
  fresher?: boolean;
  experienced?: boolean;
}

export interface MatchScoreBreakdown {
  distance: number;
  qualification: number;
  languages: number;
  skills: number;
  experience: number;
  salary: number;
  age: number;
  total: number;
  reason: string;
  rejected: boolean;
  rejectionReason?: string;
}
