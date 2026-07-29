/**
 * Shared types for the AI Sourcing Intelligence module (tenant-scoped).
 */

export type SourcingStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED' | 'COMPLETED';

export type SourceChannelType =
  | 'FACEBOOK'
  | 'WHATSAPP'
  | 'TELEGRAM'
  | 'LINKEDIN'
  | 'INSTAGRAM'
  | 'COLLEGE'
  | 'TRAINING_INSTITUTE'
  | 'REFERRAL'
  | 'JOB_PORTAL'
  | 'OTHER';

/** Audit + soft-status + optimistic lock columns on every sourcing table. */
export interface SourcingAuditable {
  id: string;
  tenantId: number;
  createdDate: string;
  modifiedDate: string;
  createdBy: string | null;
  status: SourcingStatus;
  version: number;
}

export interface SourcingSearchCriteria {
  cityId: string;
  roleId: string;
  experienceLevelId?: string;
  qualificationId?: string;
  hiringCount: number;
  joiningTimelineDays?: number;
  genderPreference?: string;
  salaryMin?: number;
  salaryMax?: number;
  shift?: string;
  languages?: string[];
  limit?: number;
}

export type RecommendationRisk = 'LOW' | 'MEDIUM' | 'HIGH';

export interface SourceRecommendation {
  sourceId: string;
  sourceName: string;
  priority: number;
  confidenceScore: number;
  expectedApplications: number;
  expectedInterviews: number;
  expectedJoinings: number;
  risk: RecommendationRisk;
  reason: string;
  qualityRating?: number | null;
  responseRate?: number | null;
  estimatedCandidatePool?: number | null;
  channelType?: SourceChannelType;
  website?: string | null;
  isSampleData?: boolean;
}

export interface RecommendationResult {
  runId?: string;
  provider: string;
  criteria: SourcingSearchCriteria;
  recommendations: SourceRecommendation[];
  planSummary: {
    expectedApplications: number;
    expectedInterviews: number;
    expectedJoinings: number;
    overallRisk: RecommendationRisk;
  };
}

export interface NaturalLanguageQuery {
  text: string;
}

export interface StructuredIntent {
  rawText: string;
  cityName?: string;
  cityId?: string;
  roleName?: string;
  roleId?: string;
  hiringCount?: number;
  experienceHint?: string;
  salaryHint?: number;
  joiningTimelineDays?: number;
  confidence: number;
  unresolvedFields: string[];
}

export type ContentChannel =
  | 'FACEBOOK'
  | 'WHATSAPP'
  | 'LINKEDIN'
  | 'CALLING_SCRIPT'
  | 'POSTER'
  | 'INTERVIEW_INVITE'
  | 'FOLLOW_UP';

export interface ContentRequest {
  cityName: string;
  roleName: string;
  hiringCount: number;
  salaryMin?: number;
  salaryMax?: number;
  sourceName?: string;
  experienceLabel?: string;
  shift?: string;
  languages?: string[];
  variantCount?: number;
}

export interface ContentPack {
  provider: string;
  items: Array<{ channel: ContentChannel; title: string; body: string; variants?: string[] }>;
}

/** PDL job_title_levels vocabulary — only these values are sent upstream. */
export const PDL_SENIORITY_LEVELS = [
  'entry',
  'senior',
  'manager',
  'director',
  'vp',
  'cxo',
  'owner',
  'partner',
  'training',
  'unpaid',
] as const;

export type PdlSeniorityLevel = (typeof PDL_SENIORITY_LEVELS)[number];

export interface PeopleSearchFilters {
  jobTitle?: string;
  skills?: string[];
  seniorityLevels?: string[];
  minExperienceYears?: number;
  maxExperienceYears?: number;
  city?: string;
  region?: string;
  country?: string;
  size?: number;
}

/** Trimmed profile — no emails/phones persisted; linkedinUrl is the contact path. */
export interface PersonProfile {
  id: string;
  fullName: string;
  jobTitle: string | null;
  company: string | null;
  location: string | null;
  skills: string[];
  experienceYears: number | null;
  linkedinUrl: string | null;
}

export interface PeopleSearchResult {
  runId?: string;
  provider: 'PDL' | 'SIMULATED';
  mode: 'live' | 'simulated';
  filters: PeopleSearchFilters;
  profiles: PersonProfile[];
  total: number | null;
  creditsUsed: number;
  error?: string;
}
