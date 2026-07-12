# HarmoviaJobs — Architecture Analysis (Step 1)

**Product:** HarmoviaJobs / AIOS Recruitment / HarmiRecruit  
**Date:** July 2026  
**Purpose:** Repository analysis before implementing AI Resume Parser, AI Match Score, and Semantic Candidate Search modules.

---

## 1. Executive Summary

HarmoviaJobs is a **multi-tenant SaaS recruitment ATS** built as a monorepo:

| Layer | Technology |
|-------|------------|
| Frontend | React 19, TypeScript, Vite, React Router 7, plain CSS design system |
| Backend | Express 4, TypeScript (ESM), raw PostgreSQL via `pg` |
| Database | PostgreSQL 16, schema `harmirecruit` in `harmoviajobs_courses_db` |
| Auth | JWT (7-day), bcrypt, workspace-scoped login |
| AI (existing) | Anthropic Claude (`@anthropic-ai/sdk`) — suggestions, scoring, job descriptions |
| Messaging | Meta WhatsApp Cloud API |
| Video | LiveKit (in-app interviews) |
| Deployment | GCP Cloud Run + Cloud SQL |

The platform is **production-ready for Phase 1 ATS workflows** but has **no resume document handling, no structured match scoring per job, and no semantic search**. These are the gaps the three new AI modules will address.

---

## 2. Repository Structure

```
AIOS_Recruitment/
├── client-v2/              # React SPA (sole frontend)
│   └── src/
│       ├── api/client.ts   # Central API client (~50 methods)
│       ├── components/     # Layout + feature components
│       ├── components/ui/  # Reusable UI primitives
│       ├── context/        # AuthContext, TenantContext
│       ├── pages/          # Route-level screens
│       ├── styles/app.css  # Design system (~3500 lines)
│       ├── types/index.ts  # Domain TypeScript types
│       └── utils/          # CSV import, tenant URLs, refetch helpers
├── server/
│   └── src/
│       ├── index.ts        # Express bootstrap, route mounting
│       ├── db.ts           # Schema init + inline migrations
│       ├── dbConfig.ts     # Pool + schema resolution
│       ├── middleware/     # auth, tenant, asyncHandler
│       ├── routes/         # 20 route modules
│       └── services/       # ai, followUpEngine, whatsapp, livekit, etc.
├── scripts/
│   ├── cloud-migrate.sql   # Idempotent production migrations
│   └── gcp-setup.sh
├── wireframes/             # Design reference (not runtime)
├── docs/                   # Architecture & module docs (this file)
├── docker-compose.yml      # Postgres + LiveKit (dev)
└── package.json            # Monorepo orchestration (concurrently)
```

**Dev ports:** Frontend `:5174`, API `:3010` (Vite proxies `/api` → Express).

---

## 3. Backend Architecture

### 3.1 Request Pipeline

```
HTTP Request
  → authMiddleware (Bearer JWT)
  → tenantMiddleware (resolve req.tenant from JWT or X-Tenant-Slug)
  → requireTenant (400 if missing tenant context)
  → inline RBAC checks in route handlers
  → pool.query(...) → JSON response
```

### 3.2 Route Modules

| Prefix | File | Scope |
|--------|------|-------|
| `/api/auth` | `routes/auth.ts` | Login, register, profile, password reset |
| `/api/tenant` | `routes/tenant.ts` | Workspace list, branding, current tenant |
| `/api/candidates` | `routes/candidates.ts` | CRUD, bulk, import/export, screening, timeline, AI suggestions |
| `/api/jobs` | `routes/jobs.ts` | CRUD, AI job description generation |
| `/api/interviews` | `routes/interviews.ts` | Schedule, evaluate, video tokens |
| `/api/interviews/join` | `routes/interviewJoin.ts` | Public candidate join |
| `/api/follow-ups` | `routes/followUps.ts` | Follow-up center + AI scripts |
| `/api/messages` | `routes/messages.ts` | WhatsApp inbox |
| `/api/whatsapp` | `routes/whatsappWebhook.ts` | Meta webhook |
| `/api/recruiters` | `routes/recruiters.ts` | Recruiter roster, dashboards |
| `/api/hiring-managers` | `routes/hiringManagers.ts` | HM management |
| `/api/companies` | `routes/companies.ts` | Client companies |
| `/api/organization` | `routes/organization.ts` | Admin org overview |
| `/api/analytics` | `routes/analytics.ts` | Dashboard KPIs |
| `/api/activities` | `routes/activities.ts` | Activity feed |
| `/api/reports` | `routes/reports.ts` | Reports + CSV export |
| `/api/settings` | `routes/settings.ts` | Tenant settings, team users |
| `/api/notifications` | `routes/notifications.ts` | Actionable notifications |
| `/api/platform` | `routes/platform.ts` | Super admin (no tenant) |

### 3.3 Services Layer

| Service | File | Responsibility |
|---------|------|----------------|
| **AI** | `services/ai.ts` | Claude integration: message suggestions, candidate scoring, follow-up scripts, job descriptions |
| **Follow-up Engine** | `services/followUpEngine.ts` | Rule-based automation (interview prep, offer follow-up, onboarding milestones) |
| **Candidate Stage** | `services/candidateStage.ts` | Pipeline stage promotion on interview booking |
| **Candidate Messaging** | `services/candidateMessaging.ts` | Persist + send WhatsApp messages |
| **WhatsApp** | `services/whatsapp.ts` | Meta Cloud API (live/simulated modes) |
| **Message Templates** | `services/messageTemplates.ts` | Pre-approved follow-up copy |
| **LiveKit** | `services/livekit.ts` | Video interview tokens, join codes |

### 3.4 AI Service (Existing)

**File:** `server/src/services/ai.ts`

**Modes:**
- `disabled` — no `ANTHROPIC_API_KEY` → all helpers return `null`, callers use heuristics
- `live` — Claude with structured JSON output (`json_schema`) or plain text

**Existing capabilities:**

| Function | Purpose | Used By |
|----------|---------|---------|
| `suggestMessages()` | 3 WhatsApp/outreach reply options | Messages, candidate suggestions |
| `scoreCandidate()` | Fit score 0–10 with strengths/gaps/summary | Background rescore |
| `rescoreCandidate()` | Fire-and-forget re-score + activity log | Candidate create/update |
| `generateFollowUpScript()` | Personalized call script | Follow-up center |
| `generateJobDescription()` | Job description draft | Jobs page |

**Pattern:** Fail-soft — API errors logged, `null` returned; user requests never fail due to AI.

**Heuristic fallback** (`computeAiScore` in `candidates.ts`):
```typescript
base = min(10, 5 + years * 0.4 + skills.length * 0.3)
```

### 3.5 Conventions

- **No ORM** — parameterized raw SQL via shared `pool`
- **Migrations** — inline functions in `initDb()` + mirror in `scripts/cloud-migrate.sql`
- **Module imports** — `.js` extensions in TS (Node ESM)
- **Error responses** — `{ error: "message" }` JSON with HTTP status codes
- **Async errors** — `asyncHandler` wrapper on select routes

---

## 4. Frontend Architecture

### 4.1 Tech Stack

| Concern | Choice |
|---------|--------|
| Framework | React 19 + TypeScript |
| Build | Vite 8 |
| Routing | React Router DOM v7 |
| Styling | Single CSS file (`styles/app.css`), CSS variables, no Tailwind/MUI |
| Charts | Recharts |
| Drag-and-drop | @dnd-kit (pipeline Kanban) |
| Video | LiveKit client |
| State | React Context only (AuthContext, TenantContext) + local `useState` |
| API | Single `api` object in `api/client.ts` |

**Not used:** Redux, Zustand, React Query, form libraries.

### 4.2 Routing & Guards

| Guard | Behavior |
|-------|----------|
| `PrivateRoute` | Requires JWT; redirects to tenant login |
| `OrgWorkspaceRoute` | Blocks super_admin from org screens |
| `PlatformRoute` | Super admin only |
| `AdminRoute` | Admin-only settings |

### 4.3 Page Inventory

| Route | Component | Purpose |
|-------|-----------|---------|
| `/candidates` | `CandidatesListPage` | List, search, bulk actions, export |
| `/candidates/new` | `AddCandidatePage` | Manual candidate form |
| `/candidates/import` | `ImportCandidatesPage` | CSV bulk import |
| `/candidates/:id` | `CandidateDetailPage` | 7-tab 360° view |
| `/pipeline` | `PipelinePage` | Kanban board |
| `/jobs` | `JobsPage` | Job CRUD + AI description |
| `/follow-ups` | `FollowUpCenterPage` | Automated follow-up center |
| `/interviews` | `InterviewsPage` | Calendar + scheduling |
| `/messages` | `MessagesPage` | WhatsApp inbox |
| `/reports` | `ReportsPage` | Recruiter/funnel/offer reports |
| `/analytics` | `AnalyticsPage` | Org charts (not in sidebar nav) |
| `/settings` | `SettingsPage` | Team, WhatsApp, branding |

Role dashboards: `AdminDashboard`, `RecruiterDashboard`, `HiringManagerDashboard`.

### 4.4 Design System

**Location:** `client-v2/src/styles/app.css` (~3500 lines)

**CSS tokens:**
- Tenant theming: `--primary`, `--tenant-primary` (runtime override via TenantContext)
- Surfaces: `--background`, `--surface`, `--surface-2`, `--border`
- Shell (dark navy): `--shell-bg`, `--shell-text`
- Semantic: `--success`, `--warning`, `--danger`, `--info`
- Layout: `--sidebar-w`, `--bottom-nav-h`, `--radius-*`, `--shadow-*`

**Reusable UI components** (`components/ui/`):

| Component | Purpose |
|-----------|---------|
| `TopBar` | Org switcher, breadcrumbs, search, notifications |
| `PageHeader` | Title, description, actions |
| `Breadcrumb` | Navigation breadcrumbs |
| `Tabs` | Tab strip with optional counts |
| `KpiCard` | Dashboard metric card |
| `StatusBadge` | Stage/status pill |
| `PlanBadge` | Tenant plan badge |
| `SideDrawer` | Right-side modal drawer |
| `OrgSwitcher` | Multi-tenant workspace picker |
| `ScorePicker` | 1–5 radio dot scorer |

**AI-related CSS classes:** `.ai-chip`, `.ai-score`, `.suggestion-clickable`

**Dark mode:** No user toggle. Fixed dual-surface design — dark navy chrome (sidebar, mobile nav) + light content area. Tenant primary color theming via CSS variables.

### 4.5 API Client Pattern

**File:** `client-v2/src/api/client.ts`

```typescript
// Every authenticated call includes:
Authorization: Bearer ${localStorage.token}
X-Tenant-Slug: ${localStorage.aios_tenant_slug}
```

Single exported `api` object with ~50 methods. Error handling maps 401/403/502/503 to user-friendly messages.

---

## 5. Authentication, RBAC & Multi-Tenancy

### 5.1 Authentication

- **JWT** in `Authorization: Bearer` header, 7-day expiry
- **Payload:** `id`, `email`, `name`, `role`, `tenant_id`, `tenant_slug`
- **Login:** Requires `workspace` slug (or `platform` for super admin)
- **Password:** bcrypt cost 10

### 5.2 Multi-Tenancy

| Concept | Implementation |
|---------|----------------|
| Tenant resolution | `X-Tenant-Slug` header (super admin) or JWT `tenant_id` |
| Row isolation | `tenantClause()` SQL helper: `alias.tenant_id = $n` |
| Assertions | `assertCandidateInTenant()`, `assertJobInTenant()` |
| Super admin | `tenant_id = NULL`; must pass `X-Tenant-Slug` for tenant routes |

**Tenant-scoped tables:** `users`, `jobs`, `candidates`, `activities`, `settings`, `companies`, `follow_ups`

**Indirectly scoped:** `interviews`, `messages` (via `candidates.tenant_id` join)

### 5.3 RBAC Roles

| Role | Scope |
|------|-------|
| `super_admin` | Platform admin; impersonate any tenant via header |
| `admin` | Full tenant: settings, org, HMs, companies, all candidates |
| `hiring_manager` | Own + managed recruiters' candidates |
| `recruiter` | Own `recruiter_id` candidates only |

RBAC is **inline in route handlers**, not centralized middleware. Common scoping pattern repeated across candidates, jobs, interviews, follow-ups, notifications.

### 5.4 Feature Flags

Stored in `tenants.features` JSONB array:
- `whatsapp`, `ai_insights`, `automation`, `reports`, `ai_calling`, `sso`, `api`, `white_label`
- Gated on frontend via `TenantContext.can(feature)` — not enforced server-side on every endpoint

---

## 6. Database Schema

**Schema:** `harmirecruit`  
**Init:** `npm run db:init` → `server/src/db.ts`  
**Production mirror:** `scripts/cloud-migrate.sql`

### 6.1 Core Tables

#### `tenants`
Workspace/organization. Fields: `slug`, `name`, `plan`, `status`, `primary_color`, `logo_initials`, `features` (JSONB).

#### `users`
Staff accounts. Fields: `email`, `password_hash`, `name`, `role`, `tenant_id`, `phone`, `timezone`, `company_id`, `managed_by_id`, `wa_signature`.

#### `companies`
Client companies within tenant. Linked to HMs/recruiters via `users.company_id`.

#### `jobs`
Job openings. Fields: `title`, `client`, `location`, `status`, `assigned_to`, `open_positions`, `description`, `tenure_days`, `tenant_id`.  
Unique: `(tenant_id, title)`.

#### `candidates`
Core ATS entity:

| Column | Type | Notes |
|--------|------|-------|
| `name`, `email`, `phone` | TEXT | Contact info |
| `skills` | JSONB | Skill array |
| `experience_years` | REAL | |
| `ai_score` | REAL | Heuristic + AI rescored (0–10) |
| `stage` | TEXT | Pipeline stage |
| `job_id`, `recruiter_id` | FK | |
| `notes`, `salary_expectation` | TEXT | |
| `source` | TEXT | e.g. `manual`, `import` |
| `hm_notes` | TEXT | |
| `is_hot` | BOOLEAN | Hot candidate flag |
| `screening` | JSONB | Pre-screen scorecard |
| `joined_at`, `expected_joining_at` | TIMESTAMPTZ | Lifecycle |
| `offer_status` | TEXT | Terminal/check-in statuses |
| `tenant_id` | FK | |

**Missing for AI modules:** No resume file storage, no parsed profile JSON, no per-job match scores, no embeddings.

#### `interviews`
Fields: `candidate_id`, `scheduled_at`, `duration_minutes`, `round_type`, `status`, `meeting_link`, `join_code`, `notes`, `score`, `evaluation` (JSONB), `created_by`.

#### `messages`
WhatsApp/inbox. Fields: `candidate_id`, `sender`, `content`, `is_outgoing`, `wa_status`, `wa_error`.

#### `activities`
Audit/timeline. Types: `pipeline`, `message`, `interview`, `screening`, `follow_up`, `hot_candidate`, `profile`.

#### `follow_ups`
Automated + manual tasks. Categories: `manual`, `interview_prep`, `interview_day`, `offer_followup`, `onboarding`, `no_response`.

#### `settings`
Composite PK `(tenant_id, key)`. JSONB values for `whatsapp`, `branding`, etc.

### 6.2 Migration Pattern

Incremental functions in `db.ts`:
- `migratePhase1Tables`, `migrateScreening`, `migrateFollowUpEngine`
- `migrateInterviewEvaluation`, `migrateWhatsAppDelivery`, `migrateJoinCodes`
- `migrateMultiTenant`, `fixStaleMeetingLinks`

New modules will add migration functions following this pattern + update `cloud-migrate.sql`.

---

## 7. Workflows

### 7.1 Candidate Workflow

```
Add (manual form) / Import (CSV) → List (filter/search/bulk) → Detail (7 tabs) → Pipeline stage moves
                                        ↓                              ↓
                                  Follow-ups                    Interviews / WhatsApp
```

**Pipeline stages:** `applied` → `screening` → `interview` → `selected` → `rejected` / `joined`

**Offer statuses:** `screening_rejected`, `offer_rejected`, `not_interested`, `joined_elsewhere`, `left_company`, `doing_well`, `issue_flagged`, `no_answer`

**Candidate detail tabs:**
1. **Profile** — view/edit, hot flag, AI score
2. **Screening** — pre-call scorecard (5 questions + 7 red flags)
3. **Timeline** — unified activity feed
4. **Communication** — message history
5. **Interviews** — schedule links, evaluation
6. **Notes** — recruiter notes
7. **AI Insights** — salary expectation + suggestion strings

**Current data entry:** Manual form (`AddCandidatePage`) or CSV import (`ImportCandidatesPage` via `utils/candidateImportFormat.ts`). **No resume upload.**

### 7.2 Job Workflow

```
Create job (title, client, location, positions, tenure, description)
  → AI description generation (optional)
  → Assign to recruiter
  → Candidates linked via job_id
  → Pipeline count + match % displayed on job cards
```

**Match % today:** Derived from average `ai_score` of linked candidates (`avg_ai_score * 10`), not job-specific structured matching.

### 7.3 ATS Workflow

End-to-end recruitment pipeline:

1. **Pre-screening** — telephonic scorecard (`PUT /candidates/:id/screening`)
2. **Interview scheduling** — auto join code, WhatsApp confirmation, stage promotion
3. **Interview evaluation** — 19-question BPO scorecard (`PUT /interviews/:id/evaluation`)
4. **Video interviews** — LiveKit tokens for staff and candidates
5. **Follow-up automation** — rules engine (interview prep, offer follow-up, onboarding milestones)
6. **Messaging** — WhatsApp inbox with AI reply suggestions
7. **Reporting** — recruiter performance, funnel, offer acceptance

**Follow-up rules (lazy sync on Follow-up Center load):**

| Rule | Category | Trigger |
|------|----------|---------|
| A | `interview_prep`, `interview_day` | Upcoming interviews |
| B | `offer_followup` | `stage=selected` + joining milestones |
| C | `no_response` | `outcome=no_answer` on reminders |
| D | `onboarding` | `stage=joined` + job tenure milestones |

---

## 8. Existing API Reference (Relevant to AI Modules)

### Candidates

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/candidates` | Filters: `job_id`, `stage`, `status`, `search`, `recruiter_id`, `scope`, `hot` |
| GET | `/api/candidates/:id` | Single candidate |
| POST | `/api/candidates` | Create; triggers heuristic `ai_score` + background `rescoreCandidate` |
| PATCH | `/api/candidates/:id` | Update; re-triggers rescore |
| GET | `/api/candidates/:id/suggestions` | AI outreach suggestions |
| GET | `/api/candidates/:id/timeline` | Unified timeline |
| PUT | `/api/candidates/:id/screening` | Pre-screen scorecard |
| POST | `/api/candidates/import` | Bulk CSV import |
| PATCH | `/api/candidates/bulk` | Bulk stage/recruiter updates |

**Search today:** SQL `ILIKE` on name, phone, email — keyword only, no semantic understanding.

### Jobs

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/jobs` | List with `pipeline_count`, `match_percent` |
| GET | `/api/jobs/:id` | Single job |
| POST | `/api/jobs/generate-description` | AI job description |

---

## 9. Gap Analysis — Current vs. Required

### Module 1: AI Resume Parser

| Requirement | Current State | Gap |
|-------------|---------------|-----|
| PDF/DOC/DOCX upload | Not implemented | Need file upload endpoint + storage |
| Extract structured fields | Manual form / CSV only | Need AI parsing service |
| Auto-populate profile | Not implemented | Need parse → preview → save flow |
| Recruiter edit before save | N/A | New UI: parse preview drawer/page |
| Store original resume | Not implemented | Need `resume_files` table or blob storage |
| Store parsed JSON | Not implemented | Need `parsed_profile` JSONB column |
| AI confidence score | Not implemented | New field on parse result |
| Reparse Resume | Not implemented | New endpoint + UI action |

**Reusable:** `services/ai.ts` Claude integration pattern, `SideDrawer` for preview, `AddCandidatePage` form fields, `CandidateDetailPage` profile tab.

### Module 2: AI Resume Match Score

| Requirement | Current State | Gap |
|-------------|---------------|-----|
| Overall Match % | Single `ai_score` (0–10), not job-specific | Need per-candidate-per-job match record |
| Technical/Skill/Experience/Location/Education match | Not implemented | Need structured score breakdown |
| Communication Score, Culture Fit | Not implemented | New AI scoring dimensions |
| Strengths, Weaknesses, Missing Skills | Partial (in rescore activity log) | Need persistent structured storage |
| Recommended Interview Areas | Not implemented | New AI output field |
| Radar chart | Recharts available, not used for match | New chart component |
| Sort candidates by match | List sorted by created_at | Need match-based sort |
| Recruiter override score | Not implemented | Need `override_score` field |

**Reusable:** `scoreCandidate()` in `ai.ts` as foundation, Recharts (used in Analytics), `JobsPage` match % display, pipeline cards `ai_score`.

### Module 3: Semantic Candidate Search

| Requirement | Current State | Gap |
|-------------|---------------|-----|
| Natural language queries | Not implemented | Need embedding + vector search or Claude ranking |
| Understand meaning/synonyms | SQL ILIKE only | Need semantic layer |
| Rank by similarity | Not implemented | Need scoring/ranking service |
| Filters (experience, salary, notice, location, etc.) | Partial (stage, job, recruiter) | Extend filter params |
| Keep keyword search | Exists | Must remain backward compatible |

**Reusable:** `CandidatesListPage` search/filter UI, `TopBar` global search, existing filter bar pattern.

---

## 10. Testing Infrastructure

**Current state:** No test framework configured. No test files in `client-v2` or `server`.

**Required for modules:** Unit tests, integration tests, API tests — will need to add Vitest/Jest for server and optionally frontend.

---

## 11. External Integrations

| Service | Env Vars | Mode |
|---------|----------|------|
| Anthropic Claude | `ANTHROPIC_API_KEY`, `AI_ENABLED`, `ANTHROPIC_MODEL` | live/disabled |
| WhatsApp | `WHATSAPP_*` vars | live/simulated |
| LiveKit | `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | live/disabled |
| PostgreSQL | `DATABASE_URL`, `DB_SCHEMA` | always |

**New for AI modules:** May need file storage (local filesystem or GCS for production), optional embedding API or pgvector extension for semantic search.

---

## 12. Implementation Constraints (from Requirements)

1. **Do not create a new project** — extend existing monorepo
2. **Do not replace architecture** — add routes, services, migrations, UI screens
3. **Do not rewrite modules** — reuse `ai.ts`, `candidates.ts`, existing components
4. **Backward compatible APIs** — existing endpoints unchanged; new endpoints added
5. **Multi-tenancy** — all new tables/columns include `tenant_id`
6. **RBAC** — same scoping patterns as existing candidate routes
7. **Migrations only** — never delete columns; additive schema changes
8. **Reuse design system** — no new styling framework
9. **Commit after each module** — wait for approval before next module

---

## 13. Key Files Reference

| Purpose | Path |
|---------|------|
| Server entry | `server/src/index.ts` |
| DB init + migrations | `server/src/db.ts` |
| AI service | `server/src/services/ai.ts` |
| Candidate routes | `server/src/routes/candidates.ts` |
| Job routes | `server/src/routes/jobs.ts` |
| Auth middleware | `server/src/middleware/auth.ts` |
| Tenant middleware | `server/src/middleware/tenant.ts` |
| Frontend API client | `client-v2/src/api/client.ts` |
| Domain types | `client-v2/src/types/index.ts` |
| Design system | `client-v2/src/styles/app.css` |
| Add candidate UI | `client-v2/src/pages/AddCandidatePage.tsx` |
| Candidate detail UI | `client-v2/src/pages/CandidateDetailPage.tsx` |
| Jobs UI | `client-v2/src/pages/JobsPage.tsx` |
| Candidates list UI | `client-v2/src/pages/CandidatesListPage.tsx` |
| Production migration | `scripts/cloud-migrate.sql` |
| Env template | `.env.example` |

---

## 14. Next Steps

See **[AI_MODULES_IMPLEMENTATION_PLAN.md](./AI_MODULES_IMPLEMENTATION_PLAN.md)** for detailed design of Modules 1–3 including proposed schema changes, API endpoints, UI changes, and test strategy.

**Awaiting approval before implementing Module 1: AI Resume Parser.**
