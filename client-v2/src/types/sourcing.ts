export interface SourcingCity {
  id: string;
  name: string;
  nightShiftAcceptance?: number | null;
  bpoCompanies?: number | null;
}

export interface SourcingRole {
  id: string;
  name: string;
  code: string;
}

export interface SourcingNamed {
  id: string;
  name: string;
  code: string;
}

export interface SourcingSource {
  id: string;
  name: string;
  channelType: string;
  qualityRating?: number | null;
  cityId?: string | null;
}

export interface SourcingSearchBody {
  cityId: string;
  roleId: string;
  experienceLevelId?: string;
  hiringCount: number;
  joiningTimelineDays?: number;
  salaryMin?: number;
  salaryMax?: number;
  shift?: string;
  languages?: string[];
  limit?: number;
}

export interface SourceRecommendation {
  sourceId: string;
  sourceName: string;
  priority: number;
  confidenceScore: number;
  expectedApplications: number;
  expectedInterviews: number;
  expectedJoinings: number;
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
  reason: string;
  channelType?: string;
}

export interface RecommendationResult {
  runId?: string;
  provider: string;
  recommendations: SourceRecommendation[];
  planSummary: {
    expectedApplications: number;
    expectedInterviews: number;
    expectedJoinings: number;
    overallRisk: string;
  };
  criteria?: SourcingSearchBody;
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

export interface ContentPack {
  provider: string;
  items: Array<{ channel: string; title: string; body: string }>;
}

export interface CopilotPlanResponse {
  intent: StructuredIntent | null;
  recommendations: RecommendationResult;
  content: ContentPack | null;
}

export interface SourcingDashboardSummary {
  topSources: Array<{ id: string; name: string; score: number; joinings: number }>;
  topCities: Array<{ id: string; name: string; sourceCount: number }>;
  topCampaigns: Array<{ id: string; name: string; hiringCount: number; status: string }>;
  applications: number;
  interviews: number;
  joinings: number;
  conversionPct: number;
}
