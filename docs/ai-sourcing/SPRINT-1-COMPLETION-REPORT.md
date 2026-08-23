# AI Sourcing Agent — Sprint 1 Completion Report

**Date:** 2026-08-08  
**Status:** Complete (Sprint 1 only — Sprint 2 not started)  
**Module:** AI Talent Sourcing Agent (`/ai-sourcing`, `/api/ai-sourcing`)  
**Note:** Distinct from existing Sourcing Copilot (`/sourcing`, `/api/sourcing`) — that module was not rebuilt.

---

## Implemented functionality

1. **Architecture audit pack** under `docs/ai-sourcing/`.
2. **Database:** `ai_sourcing_searches` migration (idempotent via `initDb`).
3. **NL requirement parser** with confidence scores:
   - Heuristic parser (always on)
   - `LLMProvider` interface + OpenAI-compatible adapter
   - Hybrid merge when AI is live
4. **Structured ATS candidate search** using skills, location, experience, stage, FTS keywords; tenant + `candidateScopeSql` isolation.
5. **APIs:** parse, search, get-by-id, recent, recommended, health.
6. **Feature flag:** `AI_SOURCING_ENABLED` (default enabled; `false` → 403).
7. **RBAC:** role-mapped `AI_SOURCING_VIEW` / `AI_SOURCING_SEARCH` (admin, recruiter, hiring_manager, super_admin).
8. **UI** at `/ai-sourcing`: NL input, example query, Search Talent, Interpret criteria, editable criteria, recommended searches, recent searches table, basic results table.
9. **Wireframe:** `wireframes/ai-sourcing/index.html`.
10. **Prompts** in `server/src/prompts/ai-sourcing/` (not in controllers).

---

## Files created

### Docs
- `docs/ai-sourcing/architecture-audit.md`
- `docs/ai-sourcing/gap-analysis.md`
- `docs/ai-sourcing/implementation-plan.md`
- `docs/ai-sourcing/data-model.md`
- `docs/ai-sourcing/api-contract.md`
- `docs/ai-sourcing/security-review.md`
- `docs/ai-sourcing/SPRINT-1-COMPLETION-REPORT.md`

### Backend
- `server/src/migrations/aiSourcing.ts`
- `server/src/routes/aiSourcing/index.ts`
- `server/src/routes/aiSourcing/search.ts`
- `server/src/services/aiSourcing/access.ts`
- `server/src/services/aiSourcing/featureFlag.ts`
- `server/src/services/aiSourcing/llmProvider.ts`
- `server/src/services/aiSourcing/heuristicParser.ts`
- `server/src/services/aiSourcing/requirementParserService.ts`
- `server/src/services/aiSourcing/candidateSearchService.ts`
- `server/src/services/aiSourcing/searchRequirementService.ts`
- `server/src/dto/aiSourcing/criteria.ts`
- `server/src/prompts/ai-sourcing/requirement-parser.ts`
- `server/src/__tests__/aiSourcingParser.test.ts`

### Frontend / wireframes
- `client-v2/src/pages/ai-sourcing/AiSourcingPage.tsx`
- `client-v2/src/types/aiSourcing.ts`
- `wireframes/ai-sourcing/index.html`

---

## Files modified

- `server/src/db.ts` — call `migrateAiSourcing`
- `server/src/index.ts` — mount `/api/ai-sourcing`
- `client-v2/src/App.tsx` — route `/ai-sourcing`
- `client-v2/src/components/Layout.tsx` — nav item under Sourcing
- `client-v2/src/api/client.ts` — `aiSourcing*` API methods
- `.env.example` — `AI_SOURCING_ENABLED` documentation

---

## Database changes

| Change | Detail |
|--------|--------|
| New table | `ai_sourcing_searches` (UUID PK, tenant_id, user_id, query_text, criteria_json, field_confidence, result_count, result_preview, parser_mode, created_at) |
| Indexes | `(tenant_id, user_id, created_at DESC)`, `(tenant_id, created_at DESC)` |
| Not created | `ai_sourcing_search_filters` (deferred; criteria in JSONB) |
| Validation | `npm run db:init` succeeded; table present in schema `harmirecruit` |

Future tables (design only in `data-model.md`): saved queries, feedback, embeddings, outreach drafts, boolean queries.

---

## New APIs

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/ai-sourcing/health` | Public |
| POST | `/api/ai-sourcing/parse` | JWT + tenant + flag + SEARCH |
| POST | `/api/ai-sourcing/search` | JWT + tenant + flag + SEARCH |
| GET | `/api/ai-sourcing/search/:id` | JWT + tenant + flag + VIEW |
| GET | `/api/ai-sourcing/searches/recent` | JWT + tenant + flag + VIEW |
| GET | `/api/ai-sourcing/recommended` | JWT + tenant + flag + VIEW |

---

## New UI

- Route: `/ai-sourcing`
- Nav: **Sourcing → AI Talent Sourcing** (org roles; not admin-only)
- Components: NL textarea, example chip, Search Talent / Interpret, editable criteria form with confidence readout, recommended chips, results table (links to candidate detail), recent searches table
- Design system: existing `app.css` classes (`.card`, `.form-input`, `.button-pill`, `.section-title`, tables)
- Wireframe: `wireframes/ai-sourcing/index.html`

---

## Test coverage

| Suite | Result |
|-------|--------|
| `server` Vitest — `aiSourcingParser.test.ts` | **9/9 passed** (heuristic parse, hybrid LLM merge, criteria validation, SQL builder, feature flag, access) |
| `server` full Vitest | **195/195 passed** (21 files) |
| `server` `tsc` build | **OK** |
| `client-v2` `tsc -b && vite build` | **OK** |
| `client-v2` oxlint | **OK** (pre-existing warnings only; none from new page) |
| `npm run db:init` | **OK** — `ai_sourcing_searches` created |

No dedicated HTTP integration test for `/api/ai-sourcing` yet (follow-up). Frontend has no test runner in this repo.

---

## Known issues

1. **Naming overlap** with Sourcing Copilot — UI copy clarifies “talent pool” vs channel strategy; keep both nav entries.
2. **No search rate limit** yet (PDL people search has one; add in Sprint 2).
3. **Location quality** depends on `current_location` / job city being populated — many legacy candidates may only match via skills/FTS.
4. **Result preview snapshot** can go stale if candidates change after search.
5. **Permissions** are role-mapped constants, not DB ACL rows.
6. **Responsive grid** on AI Sourcing page uses inline two-column layout; may stack poorly below ~800px without a CSS media rule (functional but not polished).

---

## Technical debt

- Heuristic skill/city lexicons are English/India-centric — externalize or learn from tenant data later.
- LLM JSON mode prompt embeds schema as text (no strict `json_schema` response format on all providers).
- No re-run of live SQL on GET-by-id (serves preview only).
- Client page uses inline styles for layout (matches sourcing pages pattern).
- Suggested permissions not yet reflected in any UI capability matrix beyond route access.

---

## Recommendations for Sprint 2

1. Add `express-rate-limit` on `/search` and `/parse`.
2. Optional `ai_sourcing_search_filters` normalization + user-edited vs parsed provenance.
3. Boolean / advanced filter drawer and 3-panel workspace polish.
4. Soft-skill / `technical_skills` union in SQL; salary band parsing.
5. Feedback capture (`useful` / shortlist) for learning.
6. HTTP integration tests with Supertest (auth + tenant isolation cases).
7. CSS media query for the criteria/recommended grid.
8. Do **not** merge with `/api/sourcing` — keep channel copilot and talent agent separate; share only LLM config and design system.

---

## Explicit non-goals completed as “not done”

- Sprint 2+ features not started
- Existing `/api/sourcing` / `/sourcing/*` left intact
- No git commit created (not requested)
