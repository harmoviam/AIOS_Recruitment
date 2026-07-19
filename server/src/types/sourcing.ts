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
}

export interface ContentPack {
  provider: string;
  items: Array<{ channel: ContentChannel; title: string; body: string }>;
}
