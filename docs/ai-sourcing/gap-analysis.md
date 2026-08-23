# AI Sourcing Agent — Gap Analysis

**Date:** 2026-08-08  
**Baseline:** Live HarmiRecruit codebase + `docs/ai-sourcing-intelligence/` (channel copilot)

---

## Product distinction

| Capability | Sourcing Copilot (exists) | AI Sourcing Agent (this initiative) |
|------------|---------------------------|-------------------------------------|
| Primary job | Rank **channels** / build campaigns | Find **candidates in the ATS** via NL |
| Search target | Sources masters + PDL external people | `candidates` table (tenant-scoped) |
| API prefix | `/api/sourcing` | `/api/ai-sourcing` |
| UI | `/sourcing/*` | `/ai-sourcing` |
| Status | Sprints 1–11 shipped | Sprint 1 in this delivery |

**Rule:** Extend or call existing services where useful; **do not** reimplement channel recommendation, campaign CRUD, or PDL people search.

---

## Gaps vs Sprint 1 MVP

| Requirement | Current state | Gap | Sprint 1 action |
|-------------|---------------|-----|-----------------|
| Architecture audit docs | Partial (copilot docs; ATS analysis stale on AI provider) | No `docs/ai-sourcing/` pack for talent agent | Create audit / gap / plan / data-model / API / security docs |
| NL requirement parser for ATS talent | `extractPeopleSearchFilters` targets PDL filters; copilot heuristic intent targets channels | No ATS-oriented criteria DTO + confidence scores | `RequirementParserService` + heuristic + LLM provider |
| Structured candidate search | `GET /api/candidates?search=` (FTS/ILIKE) | No persisted NL search, no criteria edit round-trip, no confidence | `CandidateSearchService` over structured fields + FTS |
| Search persistence | `people_search_run` (PDL only) | No `ai_sourcing_searches` | Migrate Sprint 1 tables only |
| UI at `/ai-sourcing` | Missing | Hub + NL search UX | New page using `app.css` primitives |
| Recommended / recent searches | People runs list on `/sourcing/people` only | Different domain | Recent from DB; recommended static+seeded examples |
| Feature flag | None for this module | — | `AI_SOURCING_ENABLED` |
| Permissions | Role strings only | No `AI_SOURCING_*` permission rows | Role mapping + docs for future ACL |
| LLM abstraction | Shared `ai.ts` helpers | Prompts inline; no module `LLMProvider` | Interface + OpenAI-compatible adapter + heuristic fallback |
| Prompts directory | Absent | Prompts in controllers/services | `server/src/prompts/ai-sourcing/` |
| Vector / semantic search | Absent | Nice-to-have later | Document only (Phase later; not Sprint 1) |
| Outreach / WhatsApp from results | Inbox exists | Not wired to this agent | Sprint 2+ |
| Boolean / Boolean builder UI | Absent | — | Sprint 2+ |
| Full 3-panel sourcing workspace | Absent for this agent | — | Foundation layout in Sprint 1; expand later |

---

## What we explicitly reuse

- JWT + tenant middleware
- `candidateScopeSql` / `accessScope` for isolation
- Candidate columns (`skills`, `experience_years`, `current_location`, `search_tsv`, …)
- Design system (`app.css`, `PageHeader` / cards / form controls)
- OpenAI-compatible runtime config (`AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`)
- Vitest patterns from `server/src/__tests__`

---

## Risks / doc drift

1. `docs/ARCHITECTURE_ANALYSIS.md` still mentions Anthropic in places — live code uses OpenAI-compatible clients.
2. Naming collision: “AI Sourcing” is used for the channel Copilot. UI copy should say **AI Talent Sourcing** / clarify “search your talent pool” to avoid confusion with **Sourcing Copilot**.
3. No fine-grained permissions table — “suggested permissions” remain role-mapped until an ACL sprint.
