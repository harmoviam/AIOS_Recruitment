# AI Sourcing Agent — Architecture Audit

**Repository:** HarmiRecruit / AIOS_Recruitment  
**Audit date:** 2026-08-08  
**Scope:** Full monorepo (server, client-v2, parser-service, compose, existing sourcing module)  
**Purpose:** Ground Sprint 1 of the **AI Talent Sourcing Agent** (internal candidate NL search) without rebuilding existing ATS or Sourcing Copilot features.

---

## 1. Stack summary

| Layer | Technology | Location |
|-------|------------|----------|
| Frontend | React 19, TypeScript, Vite 8, react-router-dom v7 | `client-v2/` |
| UI kit | Custom CSS design system (no MUI/Tailwind/shadcn) | `client-v2/src/styles/app.css` |
| Backend | Express 4, TypeScript (ESM), Zod | `server/` |
| Database | PostgreSQL 16 via `pg` Pool (**no ORM**) | `server/src/dbConfig.ts`, `server/src/db.ts` |
| Auth | JWT Bearer (`jsonwebtoken` + `bcryptjs`) | `server/src/middleware/auth.ts` |
| RBAC | Role strings on `users.role` (no permissions table) | `admin`, `recruiter`, `hiring_manager`, `super_admin` |
| Multi-tenancy | `tenants` + JWT `tenant_id` + `X-Tenant-Slug` (super-admin) | `server/src/middleware/tenant.ts` |
| Resume parser | FastAPI + spaCy + pdfplumber | `parser-service/` |
| AI / LLM | OpenAI-compatible SDK (`openai`) → vLLM / Ollama / hosted | `server/src/services/ai.ts` |
| Email | Resend | `server/src/services/email.ts` |
| WhatsApp | Meta Cloud API / WAHA / simulated | `server/src/services/whatsapp/` |
| Video | LiveKit | `server/src/services/livekit.ts` |
| Payments | Razorpay | `server/src/routes/billing.ts` |
| Vector DB | **None** | — |
| Queue / Redis | **None** (in-process async only) | — |
| Search engine | Postgres FTS (`search_tsv` + GIN) + PDL HTTP for external people | `candidates`, `peopleSearchService` |
| Caching | **None** (app-level) | — |
| Logging / APM | `console.*` only; no Sentry/OTel/winston | — |
| Tests | Vitest + Supertest (server only); client has no test runner | `server/src/__tests__/` |

---

## 2. Frontend

| Item | Finding |
|------|---------|
| Entry | `client-v2/src/main.tsx`, routes in `App.tsx` |
| API client | Single `fetch` facade `client-v2/src/api/client.ts` (`API = '/api'`) |
| Auth context | `AuthContext` (JWT in `localStorage.token`) |
| Tenant context | `TenantContext` (`features[]`, `can(feature)`) |
| Design primitives | `PageHeader`, `TopBar`, `KpiCard`, `Tabs`, `SideDrawer`, `.card`, `.button-pill`, `.form-input` |
| Nav registry | `Layout.tsx` → `navSections` |
| Feature flags (UI) | Tenant `features` JSON + sparse `can()` usage; no `VITE_AI_SOURCING_*` |
| Existing sourcing UI | `/sourcing/*` (admin-only) — channel copilot, PDL people, campaigns |
| `/ai-sourcing` route | **Did not exist prior to Sprint 1** |
| Wireframes folder | `wireframes/` has ATS Phase-1 screens; **no AI Sourcing Agent screens** (Sourcing Copilot specs live in `docs/ai-sourcing-intelligence/06_UI_WIREFRAMES.md`) |
| Frontend tests | None |

---

## 3. Backend architecture

```
server/src/
├── index.ts                 # route mounts
├── db.ts / dbConfig.ts      # schema + migrations + pool
├── middleware/              # auth, tenant, planLimits, asyncHandler
├── routes/                  # flat ATS routers + routes/sourcing/*
├── services/                # domain logic (ai, whatsapp, sourcing, …)
├── repositories/sourcing/   # sourcing data access
├── dto/                     # Zod / DTO types
├── agent/                   # recruiting tool-calling agent
├── migrations/              # sourcingIntelligence, peopleSearch, …
└── __tests__/
```

**Pattern:** Express `Router` + services + raw SQL. Heavier domains (sourcing) use repository/port style.

**Pipeline:** `authMiddleware` → `tenantMiddleware` → `requireTenant` → role/accessScope → `pool.query` → JSON `{ error }` on failure.

---

## 4. Auth & RBAC

- JWT 7-day expiry; password bcrypt.
- Roles: `super_admin` (platform), `admin`, `hiring_manager`, `recruiter`.
- Candidate visibility: `services/accessScope.ts` (`candidateScopeSql`).
- Sourcing Copilot: **org admin / super_admin only** (`services/sourcing/access.ts`).
- **No CASL / permission catalog.** Closest artifacts: role checks, plan limits (`planLimits.ts`), tenant `features` JSONB (mostly client-gated).
- Suggested future permissions for this module: `AI_SOURCING_VIEW`, `AI_SOURCING_SEARCH` (documented; mapped to roles in Sprint 1).

---

## 5. Database & core schemas

| Entity | Table | Notes |
|--------|-------|-------|
| Tenant | `tenants` | slug, plan, features JSONB, branding |
| User / Recruiter | `users` | role, tenant_id, company_id, managed_by_id |
| Job | `jobs` | + geo/skills/recommendation columns |
| Candidate | `candidates` | skills JSONB, experience_years, resume_text, search_tsv, parsed_profile, location fields |
| Application | `applications` | candidate↔job M2M + dual-write with legacy `candidates.job_id` |
| Resume | *(no table)* | `resume_meta` / `resume_text` / `parsed_profile` on candidates |
| Sourcing Copilot | many `sourcing_*` / `source` / `recommendation_run` | via `migrateSourcingIntelligence` |
| External people runs | `people_search_run` | PDL search log |

Migrations are idempotent SQL in `initDb()` + `server/src/migrations/*.ts`. No Prisma/Knex.

---

## 6. ATS modules present

Candidates CRM, jobs, applications, pipeline, screening, interviews (LiveKit), follow-ups, WhatsApp inbox, email, analytics/reports, org structure (companies / HMs / recruiters), public careers, billing, mass resume screen, recruiting agent (`/api/agent`), **Sourcing Copilot** (`/api/sourcing`).

---

## 7. Resume parsing

Hybrid: Python `parser-service` (`POST /parse`) → Node fallback (`pdf-parse` / `mammoth`) → optional LLM refine/parse via `services/ai.ts` / `parserService.ts`.

---

## 8. AI / LLM

- Shared client in `services/ai.ts` (`aiMode()` → `live` | `disabled`).
- Prompts historically **inline** in `ai.ts` (Sprint 1 introduces `server/src/prompts/` for the new module).
- Fail-soft: null + heuristics when AI disabled.
- Existing NL filter extract for PDL: `extractPeopleSearchFilters` (external people, not ATS candidates).

---

## 9. Search infrastructure

| Kind | Implementation |
|------|----------------|
| Internal candidates | Postgres FTS + ILIKE on identity fields |
| Job↔candidate match | In-process scoring (`jobRecommendation.ts`) |
| External people | People Data Labs API (`services/sourcing/people/*`) |
| Vector / embeddings | Not present |

---

## 10. Background jobs, cache, observability

- No Bull/Redis/cron. Mass-screen and AI rescore are fire-and-forget in-process.
- No Redis cache.
- Logging: console only. Health: `GET /api/health`, `GET /api/sourcing/health`.

---

## 11. Communication integrations

| Channel | Provider | Flag |
|---------|----------|------|
| Email | Resend | `EMAIL_ENABLED` |
| WhatsApp | Meta / WAHA / simulated | `WHATSAPP_ENABLED`, `WHATSAPP_PROVIDER` |

---

## 12. Existing AI sourcing (do not rebuild)

**Product:** HarmiRecruit Sourcing Copilot — channel strategy, campaigns, content, PDL people search.  
**Docs:** `docs/ai-sourcing-intelligence/` (Sprints 1–11 marked implemented).  
**API:** `/api/sourcing/*`  
**UI:** `/sourcing/*` (admin-only)

This audit’s **AI Sourcing Agent** Sprint 1 is a **separate** product surface: natural-language → structured criteria → **tenant ATS candidate** search at `/ai-sourcing` and `/api/ai-sourcing`.

---

## 13. Feature-flag patterns

Env toggles (`AI_ENABLED`, `PDL_ENABLED`, `EMAIL_ENABLED`, …) + tenant `features` JSON. No LaunchDarkly.  
Sprint 1 adds **`AI_SOURCING_ENABLED`** for the new module.

---

## 14. Testing & quality gates

| Area | Gate |
|------|------|
| Server | `npm test` (Vitest), `npm run build` (tsc) |
| Client | `npm run build` (tsc + vite), `npm run lint` (oxlint) |
| Migrations | `npm run db:init` (idempotent) |
