# 7. Development Sprint Plan (Node / Express)

**Version:** 2.0  
**Cadence:** ~1 week / sprint  
**Rule:** Each sprint must typecheck, migrate, and smoke-test before the next.  
**Gate:** Explicit approval between sprints.

---

## Sprint Map

| Sprint | Phase | Goal |
|--------|-------|------|
| **S1** ✅ | Phase 1 | `migrateSourcingIntelligence` + module skeleton + types/ports stubs |
| **S2** ✅ | Phase 2 | Geo masters CRUD (Country/State/City) behind `/api/sourcing` |
| **S3** | Phase 2–3 | Talent masters + Source Category + Source + Campaign CRUD |
| **S4** | Phase 3–4 | Full source/city intelligence fields + Mohali seed data |
| **S5** | Phase 5 | `client-v2` Sourcing Search page wired to API |
| **S6** | Phase 6 | Rule-based Recommendation Engine + Results UI |
| **S7** | Phase 7 | Sourcing Dashboard + charts |
| **S8** | Phase 8 | Copilot heuristic NL → plan |
| **S9** | Phase 9 | Template Content Generator + Content Studio |
| **S10** | Phase 10 | Learning Engine + activity capture |
| **S11** | Hardening | Tests, RBAC matrix, index review |

---

## Sprint 1 — Schema + Skeleton (APPROVAL REQUIRED)

### Scope
- Add `scripts/migrate-sourcing-intelligence.sql` (from approved V1)
- Add `migrateSourcingIntelligence()` in `server/src/db.ts` and call it from init
- Create folder skeleton: `routes/sourcing/`, `services/sourcing/ports.ts`, `repositories/sourcing/`
- Export empty router mounted at `/api/sourcing` with health/ping: `GET /api/sourcing/health`
- Shared TypeScript types for base audit fields
- Unit test stub or compile check that server boots

### Out of scope
- No master CRUD yet
- No UI pages yet
- No recommendation logic

### Exit criteria
- `npm run build` (server) **GREEN**
- App starts; migration creates sourcing tables in `harmirecruit`
- `GET /api/sourcing/health` → 200 (auth optional for health only)

---

## Sprint 2 — Geo Masters

- Zod validation, pagination, tenant scoping
- Country / State / City routes + repos + services
- Reuse JWT roles (`admin` mutates; `recruiter` read)

### Exit criteria
- Authenticated CRUD works via API client / curl

---

## Sprint 3 — Talent Masters + Sources + Campaigns

- Roles, industries, qualifications, experience, salary ranges, source categories
- Source core CRUD + Campaign / CampaignSource
- `recruiter_user_id` from JWT `users.id`

---

## Sprint 4 — Intelligence depth + seed

- All source intelligence columns + M2M
- City intelligence APIs
- Seed: India → Punjab → Mohali + Voice Process sources

---

## Sprint 5 — Search UI

- `pages/sourcing/SearchPage.tsx`
- Nav entry + API client methods
- Stub recommendation response acceptable until S6

---

## Sprint 6 — Recommendation Engine

- `RecommendationService` + `ruleBasedRecommendationService`
- Scoring policy (city/role/experience/language/success/quality/pool/response/timeline)
- Persist `recommendation_run`
- Results page with confidence, funnel, risk, reason

---

## Sprint 7 — Dashboard

- Summary + chart endpoints + page (Recharts)

---

## Sprint 8 — Copilot

- `heuristicConversationService`
- Confirm intent → `/copilot/plan`

---

## Sprint 9 — Content

- Template pack + Content Studio page

---

## Sprint 10 — Learning

- Activity API/UI → update `source_performance.success_score`
- Rankings consume learned score

---

## Sprint 11 — Hardening

- Tests for scoring policy + search route
- RBAC audit
- Perf indexes review

---

## Immediate Ask

Approve **Sprint 1 only** after reviewing this Node/Express revision.
