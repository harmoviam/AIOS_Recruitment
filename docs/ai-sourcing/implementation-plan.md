# AI Sourcing Agent — Implementation Plan

**Date:** 2026-08-08  
**Branch:** `feature/ai-sourcing-agent`

---

## Sprint 1 — Complete

NL requirement parsing, structured ATS search, `/ai-sourcing` UI, audit docs, `AI_SOURCING_ENABLED`.  
See `SPRINT-1-COMPLETION-REPORT.md`.

---

## Sprint 2 — Complete

1. JD intelligence (`JDIntelligenceService` + `ai_job_intelligence`)
2. Resume / candidate intelligence (`CandidateIntelligenceService` + `candidate_ai_profiles`)
3. Skill ontology (`ai_skills` / aliases / relationships) + expansion in search
4. Hybrid search (structured filters + FTS + ontology; soft notice/salary filters)
5. Rate limits on parse/search; job-linked search APIs; UI job analyze flow

See `SPRINT-2-COMPLETION-REPORT.md`.

---

## Sprint 3 — Next (not started)

1. Vector embeddings (`EmbeddingService`, candidate/job/requirement vectors)
2. Semantic search (`SemanticSearchService`) — prefer pgvector if adopted
3. Explainable AI match score with configurable weights
4. Match explanation persistence
5. Find similar candidates

---

## Sequencing (remaining)

```
Sprint 3: embeddings → semantic + explainable score
Sprint 4: profile polish → similar candidates → copilot refine → search history analytics
Sprint 5: talent pools → rediscovery
…
```

---

## Definition of done (Sprint 2)

- [x] JD analyze + persist without overwriting job description
- [x] Candidate AI profile without overwriting raw resume
- [x] Skill ontology seeded and used in hybrid search
- [x] Hybrid ranking returns hybridScore + matchSignals
- [x] Job → search API + UI
- [x] Tests + builds + db:init green
- [x] Completion report published
