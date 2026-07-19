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
  website?: string | null;
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
  items: Array<{ channel: string; title: string; body: string; variants?: string[] }>;
}

export interface CopilotPlanResponse {
  intent: StructuredIntent | null;
  recommendations: RecommendationResult;
  content: ContentPack | null;
}

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

export interface CopilotPeopleResponse {
  intent: StructuredIntent | null;
  result: PeopleSearchResult;
}

export interface PeopleRunListItem {
  id: string;
  prompt_text: string | null;
  result_count: number;
  provider: string;
  credits_used: number;
  created_date: string;
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
