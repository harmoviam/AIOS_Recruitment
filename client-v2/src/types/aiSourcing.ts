export type CandidateSearchCriteria = {
  skills: string[];
  keywords: string[];
  jobTitle?: string | null;
  location?: string | null;
  minExperienceYears?: number | null;
  maxExperienceYears?: number | null;
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
