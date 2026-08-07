# AI Sourcing Agent — Implementation Plan

**Date:** 2026-08-08  
**Constraint:** Sprint 1 only. Do not start Sprint 2.

---

## Goals (Sprint 1)

1. Document architecture / gaps / data model / APIs / security.
2. Migrate `ai_sourcing_searches` (Sprint 1 tables only).
3. Ship `/ai-sourcing` UI (NL input, examples, recommended, recent, editable criteria, basic results).
4. Backend: parse + structured search + persistence + feature flag + tenant isolation.
5. LLMProvider abstraction with heuristic fallback; prompts under `prompts/`.
6. Tests + build validation + completion report.

---

## Sprint 1 work packages

### WP0 — Docs (`docs/ai-sourcing/`)
- architecture-audit, gap-analysis, implementation-plan, data-model, api-contract, security-review

### WP1 — Database
- `server/src/migrations/aiSourcing.ts`
- Call from `initDb()`
- Table: `ai_sourcing_searches` (criteria JSON; no separate filters table yet)

### WP2 — Backend module
```
server/src/
  routes/aiSourcing/
  services/aiSourcing/
  dto/aiSourcing/
  prompts/ai-sourcing/
```
- Feature flag middleware / guard: `AI_SOURCING_ENABLED`
- Access: map `AI_SOURCING_VIEW` / `AI_SOURCING_SEARCH` → roles that can list candidates (`admin`, `recruiter`, `hiring_manager`, `super_admin` with tenant)
- Services: `RequirementParserService`, `SearchRequirementService`, `CandidateSearchService`
- `LLMProvider` interface + `OpenAiCompatibleProvider` + always-available heuristic parser

### WP3 — APIs
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/ai-sourcing/health` | Module health + flag |
| POST | `/api/ai-sourcing/parse` | NL → criteria + confidence |
| POST | `/api/ai-sourcing/search` | Parse/merge criteria → search → persist |
| GET | `/api/ai-sourcing/search/:id` | Fetch saved search + preview |
| GET | `/api/ai-sourcing/searches/recent` | Recent for current user/tenant |
| GET | `/api/ai-sourcing/recommended` | Suggested NL queries |

### WP4 — Frontend
- Page: `client-v2/src/pages/ai-sourcing/AiSourcingPage.tsx`
- Route `/ai-sourcing` in `App.tsx`
- Nav item in `Layout.tsx`
- API methods on `api` client
- Wireframe HTML sketch under `wireframes/ai-sourcing/` for reference

### WP5 — Quality
- Unit tests: heuristic parser, criteria validation, SQL criteria builder (pure)
- `tsc` build server + client; oxlint client; vitest server
- Completion report

---

## Out of scope (Sprint 2+)

- Vector / embedding search
- External provider federation (PDL already under `/sourcing/people`)
- Boolean query builder, saved filter libraries
- Outreach sequences from results
- Full 3-panel workspace polish
- Learning-to-rank / feedback loops
- Permission table + CASL
- Redis queue for long-running enrichment

---

## Sequencing

```
Docs → Migration → DTO/validation → Parser (heuristic) → LLMProvider → Search service
  → Routes → Feature flag → Client page → Tests → Report
```

---

## Definition of done (Sprint 1)

- [x] Docs written from codebase facts
- [x] Flag off → 403 `AI_SOURCING_DISABLED` for secured routes
- [x] Heuristic parse works without AI keys
- [x] Search respects tenant + `candidateScopeSql`
- [x] UI loads at `/ai-sourcing` with edit-criteria flow
- [x] Tests + builds green
- [x] Completion report published
- [x] No commit unless user asks
