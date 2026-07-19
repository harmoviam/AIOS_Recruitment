# 1. Complete Product Architecture (Node / Express)

**Version:** 2.0  

## 1.1 Product Vision

**AI Sourcing Intelligence Agent** is a Recruiter Copilot that recommends *where* and *how* to hire — not a candidate search chatbot.

| Persona | Job to be done |
|---------|----------------|
| Recruiter | Find best channels for a req in minutes |
| Recruitment Manager | Forecast funnel & assign campaigns |
| Sourcer | Get posting content + calling scripts |
| Ops / Admin | Maintain masters, sources, city intel |

## 1.2 Core Value Loop

```
Need → Structured Intent → Ranked Sources → Plan + Content → Execute → Capture Outcomes → Learn → Better Rankings
```

## 1.3 Architectural Style (TypeScript)

| Principle | Application in this repo |
|-----------|--------------------------|
| Clean Architecture | `routes` → `services` (use-cases) → `repositories` (SQL) ; domain types in `types`/`dto` |
| DDD | Bounded context folder: `services/sourcing/*` |
| SOLID | Ports as TypeScript interfaces; swap implementations via factory/config |
| Repository + DTO | SQL stays in repos; routes return DTOs only |
| Existing patterns | Mirror `asyncHandler`, `authMiddleware`, `tenantMiddleware`, fail-soft services |
| Learning | `sourcing_recruiter_activity` → recompute `source_performance` in same request (queue later) |

## 1.4 Logical Layers

```
┌─────────────────────────────────────────────────────────────┐
│  client-v2 (React + TS) — /sourcing/* pages                 │
│  Copilot | Search | Results | Dashboard | Sources | Content │
└───────────────────────────┬─────────────────────────────────┘
                            │ /api/*  JWT + tenant
┌───────────────────────────▼─────────────────────────────────┐
│  Express API                                                │
│  routes/sourcing/*  + validation (zod)                      │
├─────────────────────────────────────────────────────────────┤
│  Application services                                       │
│  • masterCrud  • sourcingSearchUseCase                      │
│  • RecommendationService (interface)                        │
│  • ContentGeneratorService (interface)                      │
│  • ConversationService (interface)                          │
│  • learningEngine  • dashboardAnalytics                     │
├─────────────────────────────────────────────────────────────┤
│  Repositories (pg SQL)                                      │
│  cityRepo | sourceRepo | performanceRepo | activityRepo …   │
├─────────────────────────────────────────────────────────────┤
│  PostgreSQL (schema harmirecruit) — shared with ATS         │
└─────────────────────────────────────────────────────────────┘
```

## 1.5 AI-Ready Pluggable Services

```ts
// server/src/services/sourcing/ports.ts
export interface RecommendationService {
  recommend(criteria: SourcingSearchCriteria): Promise<RecommendationResult>;
}

export interface ContentGeneratorService {
  generate(request: ContentRequest): Promise<ContentPack>;
}

export interface ConversationService {
  parse(query: NaturalLanguageQuery): Promise<StructuredIntent>;
}
```

| Interface | Sprint 1–9 Implementation | Future |
|-----------|---------------------------|--------|
| `RecommendationService` | `ruleBasedRecommendationService` | `llmRecommendationService` |
| `ContentGeneratorService` | `templateContentGeneratorService` | `llmContentGeneratorService` |
| `ConversationService` | `heuristicConversationService` | `llmConversationService` |

Selection via env, e.g. `SOURCING_RECOMMENDATION_PROVIDER=rule|llm`.

## 1.6 Cross-Cutting (reuse ATS)

| Concern | Approach |
|---------|----------|
| Security | Existing JWT; roles already on `users.role` |
| Tenant | `tenant_id` on all sourcing tables; `requireTenant` |
| Audit | `created_date`, `modified_date`, `created_by` on sourcing tables |
| Soft status | `status`: ACTIVE / INACTIVE / ARCHIVED |
| Optimistic lock | `version` BIGINT; check-and-increment on update |
| Errors | Extend existing error patterns; consistent `{ error, details }` |
| Pagination | `page`, `pageSize`, `sort`, `q` on list routes |
| Logging | Existing console/structured logs + request context |

## 1.7 Base Row Contract (sourcing tables)

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK (`gen_random_uuid()`) |
| `tenant_id` | INTEGER | FK → `tenants(id)` |
| `created_date` | TIMESTAMPTZ | |
| `modified_date` | TIMESTAMPTZ | |
| `created_by` | VARCHAR(100) | user email or id string |
| `status` | VARCHAR(20) | |
| `version` | BIGINT | optimistic lock |

ATS tables keep SERIAL ids; sourcing domain uses UUID (no collision, clear boundary).

## 1.8 Identity

- **Do not** create a separate password-backed `recruiter` table.
- Campaigns / activities reference `users.id` (INTEGER) as `recruiter_user_id`.
- Optional profile enrichment later; not required for Sprint 1–6.

## 1.9 Non-Goals (v1)

- No Spring Boot / Java
- No LLM calls for recommendation, content, or copilot parse
- No candidate resume parsing (ATS owns that)
- No WhatsApp send from sourcing module (templates only)
- No real map tiles (placeholder)

## 1.10 Success Metrics

| Metric | Target |
|--------|--------|
| Time to first sourcing plan | < 30 seconds |
| Plan → campaign | 1 click |
| Ranking quality | Improves after Learning Engine (S10) |
| Recruiter adoption | ≥ 3 searches / recruiter / week |
