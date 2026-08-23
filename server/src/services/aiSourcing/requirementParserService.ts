import {
  emptyCriteria,
  parseCriteria,
  type CandidateSearchCriteria,
  type FieldConfidence,
} from '../../dto/aiSourcing/criteria.js';
import { heuristicParseRequirements } from './heuristicParser.js';
import { getDefaultLlmProvider, type LLMProvider } from './llmProvider.js';

export type ParseRequirementsResult = {
  query: string;
  criteria: CandidateSearchCriteria;
  fieldConfidence: FieldConfidence;
  parserMode: 'heuristic' | 'llm' | 'hybrid';
  unresolvedFields: string[];
};

function mergeConfidence(a: FieldConfidence, b: FieldConfidence): FieldConfidence {
  const out: FieldConfidence = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (out[k] == null || v > out[k]) out[k] = v;
  }
  return out;
}

function preferDefined<T>(llm: T | null | undefined, heuristic: T | null | undefined): T | null | undefined {
  if (llm == null || llm === '') return heuristic;
  if (Array.isArray(llm) && llm.length === 0) return heuristic;
  return llm;
}

/**
 * RequirementParserService — NL → CandidateSearchCriteria with confidence.
 * Uses LLM when available; always falls back to deterministic heuristics.
 */
export class RequirementParserService {
  constructor(private readonly llm: LLMProvider = getDefaultLlmProvider()) {}

  async parse(query: string): Promise<ParseRequirementsResult> {
    const trimmed = query.trim();
    const heuristic = heuristicParseRequirements(trimmed);

    if (!this.llm.isAvailable()) {
      return {
        query: trimmed,
        criteria: heuristic.criteria,
        fieldConfidence: heuristic.fieldConfidence,
        parserMode: 'heuristic',
        unresolvedFields: heuristic.unresolvedFields,
      };
    }

    const llmResult = await this.llm.parseRequirements(trimmed);
    if (!llmResult) {
      return {
        query: trimmed,
        criteria: heuristic.criteria,
        fieldConfidence: heuristic.fieldConfidence,
        parserMode: 'heuristic',
        unresolvedFields: heuristic.unresolvedFields,
      };
    }

    const h = heuristic.criteria;
    const l = llmResult.criteria;
    const merged: CandidateSearchCriteria = parseCriteria({
      skills:
        l.skills && l.skills.length
          ? Array.from(new Set([...l.skills, ...h.skills])).slice(0, 30)
          : h.skills,
      preferredSkills:
        l.preferredSkills && l.preferredSkills.length
          ? Array.from(new Set([...l.preferredSkills, ...h.preferredSkills])).slice(0, 30)
          : h.preferredSkills,
      keywords:
        l.keywords && l.keywords.length
          ? Array.from(new Set([...l.keywords, ...h.keywords])).slice(0, 30)
          : h.keywords,
      roles:
        l.roles && l.roles.length
          ? Array.from(new Set([...l.roles, ...h.roles])).slice(0, 10)
          : h.roles,
      industries:
        l.industries && l.industries.length
          ? Array.from(new Set([...l.industries, ...h.industries])).slice(0, 15)
          : h.industries,
      jobTitle: preferDefined(l.jobTitle, h.jobTitle) ?? null,
      location: preferDefined(l.location, h.location) ?? null,
      seniority: preferDefined(l.seniority, h.seniority) ?? null,
      minExperienceYears: preferDefined(l.minExperienceYears, h.minExperienceYears) ?? null,
      maxExperienceYears: preferDefined(l.maxExperienceYears, h.maxExperienceYears) ?? null,
      noticePeriodMaxDays: preferDefined(l.noticePeriodMaxDays, h.noticePeriodMaxDays) ?? null,
      maxSalaryLpa: preferDefined(l.maxSalaryLpa, h.maxSalaryLpa) ?? null,
      stage: preferDefined(l.stage, h.stage) ?? null,
      minAiScore: preferDefined(l.minAiScore, h.minAiScore) ?? null,
    });

    // Boost confidence for fields the LLM filled; keep heuristic scores otherwise.
    const fieldConfidence = mergeConfidence(heuristic.fieldConfidence, llmResult.fieldConfidence);
    for (const key of Object.keys(merged) as (keyof CandidateSearchCriteria)[]) {
      const val = merged[key];
      const filled = Array.isArray(val) ? val.length > 0 : val != null && val !== '';
      if (filled && fieldConfidence[key] == null) fieldConfidence[key] = 0.75;
    }

    const unresolvedFields: string[] = [];
    if (!merged.skills.length && !merged.jobTitle && !merged.keywords.length) unresolvedFields.push('skills');
    if (merged.location == null) unresolvedFields.push('location');
    if (merged.minExperienceYears == null && merged.maxExperienceYears == null) {
      unresolvedFields.push('experience');
    }

    return {
      query: trimmed,
      criteria: merged,
      fieldConfidence,
      parserMode: 'hybrid',
      unresolvedFields,
    };
  }
}

export function createRequirementParserService(llm?: LLMProvider) {
  return new RequirementParserService(llm ?? getDefaultLlmProvider());
}

/** Empty parse result helper for tests */
export function emptyParse(query = ''): ParseRequirementsResult {
  return {
    query,
    criteria: emptyCriteria(),
    fieldConfidence: {},
    parserMode: 'heuristic',
    unresolvedFields: ['skills', 'location', 'experience'],
  };
}
