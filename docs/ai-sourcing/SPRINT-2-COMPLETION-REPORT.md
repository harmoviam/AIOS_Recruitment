# AI Sourcing Agent — Sprint 2 Completion Report

**Date:** 2026-08-08  
**Branch:** `feature/ai-sourcing-agent`  
**Status:** Complete (Sprint 2 only — Sprint 3 not started)  
**Module version:** `1.1.0-sprint2`

---

## Implemented functionality

1. **JD Intelligence** — `JDIntelligenceService` extracts role, seniority, required/preferred skills, industries, experience, location, salary, notice from a job (heuristic + optional LLM). Persists to `ai_job_intelligence` without overwriting `jobs.description`.
2. **Resume / Candidate Intelligence** — `CandidateIntelligenceService` builds normalized AI profiles into `candidate_ai_profiles`. Never mutates `resume_text` or `parsed_profile`.
3. **Skill ontology** — tables `ai_skills`, `ai_skill_aliases`, `ai_skill_relationships` with seeded AWS/K8s/Java/DevOps graph. Expansion (e.g. EKS → Kubernetes + AWS) used in hybrid search.
4. **Hybrid candidate search** — structured filters + FTS (`search_tsv`) + skill ontology expansion + `technical_skills` / `soft_skills` / resume text matching; ranks by FTS rank + existing `ai_score` (`hybridScore`). Soft filters for notice period and salary LPA.
5. **Criteria extensions** — industries, preferredSkills, roles, seniority, noticePeriodMaxDays, maxSalaryLpa.
6. **Rate limiting** — 30 req/min per user on `/parse` and `/search`.
7. **UI** — job selector “Analyze JD & search”, expanded criteria fields, hybrid score + match signals column.
8. **APIs** — job analyze/intelligence/search, candidate intelligence, skills list/normalize.

Vector / embedding semantic search remains **Sprint 3** (no pgvector dependency introduced).

---

## Files created

### Backend
- `server/src/dto/aiSourcing/jobIntelligence.ts`
- `server/src/dto/aiSourcing/candidateIntelligence.ts`
- `server/src/prompts/ai-sourcing/jd-analysis.ts`
- `server/src/prompts/ai-sourcing/candidate-analysis.ts`
- `server/src/services/aiSourcing/skillOntologyService.ts`
- `server/src/services/aiSourcing/jdIntelligenceService.ts`
- `server/src/services/aiSourcing/candidateIntelligenceService.ts`
- `server/src/routes/aiSourcing/jobs.ts`
- `server/src/routes/aiSourcing/candidates.ts`
- `server/src/routes/aiSourcing/skills.ts`
- `server/src/__tests__/aiSourcingSprint2.test.ts`

### Docs
- `docs/ai-sourcing/SPRINT-2-COMPLETION-REPORT.md`

---

## Files modified

- `server/src/migrations/aiSourcing.ts` — Sprint 2 tables + skill seed
- `server/src/dto/aiSourcing/criteria.ts` — extended criteria
- `server/src/services/aiSourcing/candidateSearchService.ts` — hybrid search
- `server/src/services/aiSourcing/heuristicParser.ts` — industry/notice/salary/role
- `server/src/services/aiSourcing/llmProvider.ts` — `completeJson`
- `server/src/services/aiSourcing/requirementParserService.ts` — merge new fields
- `server/src/services/aiSourcing/searchRequirementService.ts` — job-linked search
- `server/src/routes/aiSourcing/index.ts`, `search.ts`
- `server/src/__tests__/aiSourcingParser.test.ts`
- `client-v2/src/types/aiSourcing.ts`
- `client-v2/src/api/client.ts`
- `client-v2/src/pages/ai-sourcing/AiSourcingPage.tsx`
- `docs/ai-sourcing/implementation-plan.md`, `data-model.md`, `api-contract.md` (updated below / alongside)

---

## Database changes

| Table | Purpose |
|-------|---------|
| `ai_job_intelligence` | Structured JD intel per job (tenant scoped) |
| `candidate_ai_profiles` | Normalized AI profile (does not replace raw resume) |
| `ai_skills` | Skill ontology nodes |
| `ai_skill_aliases` | Alias → skill |
| `ai_skill_relationships` | RELATED_TO / REQUIRES / USED_WITH / … |
| `ai_sourcing_searches.job_id` | Optional link to sourced job |

Validated with `npm run db:init`.

---

## New APIs

| Method | Path |
|--------|------|
| POST | `/api/ai-sourcing/jobs/:jobId/analyze` |
| GET | `/api/ai-sourcing/jobs/:jobId/intelligence` |
| POST | `/api/ai-sourcing/jobs/:jobId/search` |
| POST | `/api/ai-sourcing/candidates/:candidateId/intelligence` |
| GET | `/api/ai-sourcing/candidates/:candidateId/intelligence` |
| GET | `/api/ai-sourcing/skills` |
| POST | `/api/ai-sourcing/skills/normalize` |

Existing parse/search endpoints accept extended criteria; search returns `hybridScore`, `matchSignals`, `expandedSkills`.

---

## New UI

- Job dropdown + **Analyze JD & search**
- Industry / notice / salary criteria editors
- Results: Hybrid score + Why (match signals)
- Expanded skill ontology preview under interpreted criteria

---

## Test coverage

| Suite | Result |
|-------|--------|
| Server Vitest | **200/200** (22 files; +5 Sprint 2 tests) |
| Server `tsc` | **OK** |
| `db:init` | **OK** |
| Client build | See CI/local run |

---

## Known issues / technical debt

1. Hybrid score is FTS + `ai_score` only — not yet full explainable weighted match (Sprint 3).
2. Notice/salary soft filters rely on substring parsing of free-text fields.
3. Skill ontology seed is India/tech-centric; tenant customization UI not built.
4. Candidate intelligence LLM path optional; heuristic always available.
5. No HTTP integration tests for new job/candidate routes yet.

---

## Recommendations for Sprint 3

1. Candidate/job embeddings + pgvector (or existing vector infra if added).
2. Full explainable match score with configurable tenant weights.
3. Persist match explanations per candidate/search.
4. Find-similar-candidates endpoint using embeddings.
5. Search quality eval harness (Precision@10 / NDCG).

---

## Explicit non-goals (not done)

- Semantic vector search
- Autonomous sourcing agent
- External enrichment / GitHub connector
- Outreach sequences
- Multi-agent orchestration
