export type CandidateSearchCriteria = {
  skills: string[];
  preferredSkills: string[];
  keywords: string[];
  roles: string[];
  industries: string[];
  jobTitle?: string | null;
  location?: string | null;
  seniority?: string | null;
  minExperienceYears?: number | null;
  maxExperienceYears?: number | null;
  noticePeriodMaxDays?: number | null;
  maxSalaryLpa?: number | null;
  stage?: string | null;
  minAiScore?: number | null;
};

export type FieldConfidence = Record<string, number>;

export type AiSourcingParseResult = {
  query: string;
  criteria: CandidateSearchCriteria;
  fieldConfidence: FieldConfidence;
  parserMode: 'heuristic' | 'llm' | 'hybrid';
  unresolvedFields: string[];
};

export type AiSourcingCandidateHit = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  skills: unknown;
  experienceYears: number;
  stage: string;
  location: string | null;
  jobTitle: string | null;
  aiScore: number;
  hybridScore?: number;
  matchSignals?: string[];
};

export type AiSourcingSearchResult = {
  id: string;
  query: string;
  criteria: CandidateSearchCriteria;
  fieldConfidence: FieldConfidence;
  parserMode: string;
  resultCount: number;
  results: AiSourcingCandidateHit[];
  limit: number;
  offset: number;
  createdAt: string;
  jobId?: number | null;
  expandedSkills?: string[];
};

export type AiSourcingRecentItem = {
  id: string;
  query: string;
  resultCount: number;
  parserMode: string;
  criteria: CandidateSearchCriteria;
  createdAt: string;
};

export type AiSourcingRecommendedItem = {
  label: string;
  query: string;
};

export type JobIntelligence = {
  role?: string | null;
  roles?: string[];
  seniority?: string | null;
  requiredSkills?: string[];
  preferredSkills?: string[];
  industries?: string[];
  minExperienceYears?: number | null;
  maxExperienceYears?: number | null;
  location?: string | null;
  noticePeriodMaxDays?: number | null;
  maxSalaryLpa?: number | null;
  summary?: string | null;
  fieldConfidence?: FieldConfidence;
};

export type AiJobIntelligenceResult = {
  jobId: number;
  intelligence: JobIntelligence;
  criteria: CandidateSearchCriteria;
  parserMode: string;
  promptVersion: string;
  updatedAt: string;
};
