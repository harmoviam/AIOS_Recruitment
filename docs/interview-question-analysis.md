# HarmiRecruit — AI Interview Question Generator

**Analysis Document (Step 1 — No Code)**  
**Product:** HarmiRecruit / HarmoviaJobs / AIOS Recruitment  
**Date:** 19 July 2026  
**Status:** Architecture analysis complete — ready for Milestone 1 after approval

---

## 1. Critical Stack Finding

The feature brief assumes **Java 21 / Spring Boot 3 / Material UI / Flyway**.  
The **live HarmiRecruit codebase is different**:

| Brief assumption | Actual codebase |
|------------------|-----------------|
| Java 21 + Spring Boot 3 | **Node.js + Express 4 + TypeScript (ESM)** |
| Spring AI | **OpenAI SDK** (`openai` package) against OpenAI-compatible APIs |
| Flyway migrations | **Inline SQL** in `server/src/db.ts` + `scripts/cloud-migrate.sql` |
| JPA entities | **Raw `pg` SQL** (no ORM) |
| Material UI | **Custom CSS design system** (`client-v2/src/styles/app.css`) |
| React forms (MUI) | **Plain React + CSS** (no Formik / React Hook Form / MUI) |

**Recommendation:** Implement the Interview Question Generator on the **existing Node + React stack**, using the same layered separation the brief requires (Controller → Service → AI Provider → Prompt Builder → Parser → Mapper → DB). Do **not** introduce a parallel Java service unless product explicitly wants a greenfield rewrite.

All designs below map the brief’s architecture onto HarmiRecruit conventions.

---

## 2. Current Architecture

### 2.1 Monorepo layout

```
AIOS_Recruitment/
├── client-v2/                 # React 19 + Vite + TypeScript SPA
├── server/                    # Express API (TypeScript ESM)
├── parser-service/            # Python FastAPI (resume text extraction)
├── scripts/                   # cloud-migrate.sql, GCP helpers
├── docs/                      # Architecture & module plans
└── package.json               # concurrently orchestration
```

| Layer | Technology |
|-------|------------|
| Frontend | React 19, TypeScript, Vite 8, React Router 7, plain CSS |
| Backend | Express 4, TypeScript ESM, `pg` |
| Database | PostgreSQL 16, schema `harmirecruit` |
| Auth | JWT (7-day), bcrypt, workspace-scoped login |
| AI | OpenAI-compatible chat completions (`AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL`) |
| Video interviews | LiveKit |
| Deploy | GCP Cloud Run + Cloud SQL |

**Ports:** Frontend `:5174`, API `:3010`, Parser `:8020`.

### 2.2 Request pipeline

```
HTTP Request
  → authMiddleware (Bearer JWT)
  → tenantMiddleware (JWT / X-Tenant-Slug)
  → requireTenant
  → inline RBAC in route handlers
  → service / pool.query
  → JSON { … } or { error }
```

### 2.3 Existing AI module

**Primary file:** `server/src/services/ai.ts`

| Capability | Function | Status |
|------------|----------|--------|
| Message suggestions | `suggestMessages()` | Live |
| Candidate score | `scoreCandidate()` / `rescoreCandidate()` | Live |
| Follow-up script / WhatsApp | `generateFollowUpScript()` / `generateFollowUpMessage()` | Live |
| Job description | `generateJobDescription()` | Live |
| Screening Qs from JD | `generateScreeningQuestionsFromJd()` | Live (closest related feature) |
| Resume parse / refine | `parseResume()` / `refineResumeText()` | Live |

**Modes:** `live` | `disabled` (fail-soft — AI errors never crash user requests).

**Internal helpers:** `jsonCall` / `jsonCallResult` / `textCall` / `extractJson`.

Related AI/helpers:

| File | Role |
|------|------|
| `server/src/services/followUpAi.ts` | Batch follow-up AI |
| `server/src/services/screeningQuestions.ts` | Job screening Q templates + AI generation + persistence on `jobs.screening_questions` |
| `server/src/services/parserService.ts` | Resume text → AI structured parse |
| `server/src/services/jobRecommendation.ts` | Job recommendation (DTO + mapper pattern) |
| `parser-service/` | Python PDF/DOCX extraction + spaCy fallback |

### 2.4 Provider integrations (actual vs brief)

| Provider | Brief | Actual |
|----------|-------|--------|
| **OpenAI** | Required | Supported via `openai` SDK + `AI_API_KEY` / default base URL |
| **Ollama** | Required | Supported via `AI_BASE_URL=http://localhost:11434/v1` |
| **Claude / Anthropic** | Required | **Not present** — older docs mention Claude; runtime uses OpenAI-compatible API only |
| **Spring AI** | Required | **Not present** (no Java) |
| Gemini / Azure / DeepSeek / Mistral | Future | Feasible as OpenAI-compatible endpoints or new provider adapters |

**Config (`.env.example`):**

```
AI_BASE_URL=
AI_API_KEY=
AI_MODEL=
AI_ENABLED=true
AI_TIMEOUT_MS=60000
```

There is **no multi-provider switch**, **no prompt template store**, and **no AI request history / token cost table**.

### 2.5 Existing Interview module (IMPORTANT)

An **Interview module already exists**, but it is a **scheduling + LiveKit video + evaluation** workflow — **not** an interview-question bank / generator.

| Area | Path |
|------|------|
| Routes | `server/src/routes/interviews.ts`, `interviewJoin.ts` |
| Table | `interviews` (candidate_id, scheduled_at, duration, round_type, status, meeting_link, score, …) |
| Pages | `InterviewsPage`, `InterviewRoomPage`, `InterviewEvaluationPage`, `JoinInterviewPage` |
| Components | `InterviewVideoRoom`, `InterviewEvaluationPanel` |
| Screening Qs | Stored on `jobs.screening_questions` JSONB; used in evaluation room |

**Naming conflict:** Brief APIs use `/api/interview/*`. Existing APIs use `/api/interviews/*` (plural) for calendar interviews.

**Suggested API namespace for the new feature:**

```
/api/interview-questions/...
```

or

```
/api/question-bank/...
```

Avoid colliding with `/api/interviews`.

### 2.6 Closest existing feature: Screening questions

`generateScreeningQuestionsFromJd()` + `screeningQuestions.ts` already:

- Generate pre-screen + interview questions from JD
- Persist JSON on the job
- Power LiveKit evaluation scoring

**Gap vs new feature:** No templates library, no expected answers / evaluation criteria / weightage bank, no category checkboxes (Technical, System Design, Cloud…), no history/analytics, no export PDF/DOCX/Excel, no clone/favourite/archive, no provider/model selection per request.

**Reuse strategy:** Keep job screening questions for live interviews; build Question Generator as a **reusable bank/template module** that can later feed AI Interviewer / Copilot.

---

## 3. Inventory — What Exists

### 3.1 REST APIs (selected)

| Prefix | File |
|--------|------|
| `/api/auth` | `routes/auth.ts` |
| `/api/candidates` | `routes/candidates.ts` |
| `/api/jobs` | `routes/jobs.ts` (+ generate-description, screening-questions) |
| `/api/interviews` | `routes/interviews.ts` |
| `/api/analytics` | `routes/analytics.ts` |
| `/api/reports` | `routes/reports.ts` |
| `/api/settings` | `routes/settings.ts` |
| `/api/platform` | `routes/platform.ts` |
| … | 20+ route modules under `server/src/routes/` |

### 3.2 “Entity” model (tables, not JPA)

Defined in `server/src/db.ts` (no entity classes). Relevant tables: `tenants`, `users`, `candidates`, `jobs`, `interviews`, `activities`, `applications`, `messages`, `follow_ups`, `candidate_resumes`, billing tables, etc.

**DTO / mapper precedent:** `server/src/dto/jobRecommendation.ts` + `server/src/mappers/jobRecommendationMapper.ts`.

### 3.3 React pages (relevant)

| Page | Path |
|------|------|
| Jobs (AI JD + screening Q regen) | `pages/JobsPage.tsx` |
| Interviews calendar | `pages/InterviewsPage.tsx` |
| Interview evaluation | `pages/InterviewEvaluationPage.tsx` |
| Analytics | `pages/AnalyticsPage.tsx` |
| Reports | `pages/ReportsPage.tsx` |

**No** Interview Question Generator page exists.

### 3.4 Reusable frontend components

| Component | Path |
|-----------|------|
| Layout + nav | `components/Layout.tsx` |
| PageHeader, SideDrawer, Tabs, KpiCard, StatusBadge, ScorePicker, TopBar | `components/ui/*` |
| Resume upload zone | `components/ResumeUploadZone.tsx` |
| Form patterns | `.form-card`, `.input-field`, `.button-pill` in `styles/app.css` |
| API client | `api/client.ts` |
| Auth / tenant | `context/AuthContext.tsx`, `TenantContext.tsx` |
| Charts | Recharts (AnalyticsPage) |

**Dialogs:** `SideDrawer` (drawer pattern), not MUI Dialog.  
**Tables:** HTML/CSS tables + list pages (no DataGrid / MUI Table).  
**Export:** CSV download helpers only (`exportCandidates`, reports). **No PDF / DOCX / Excel** utilities.

### 3.5 Authentication & roles

| Role | Scope |
|------|-------|
| `super_admin` | Platform |
| `admin` | Org admin / settings |
| `hiring_manager` | Team-scoped candidates/interviews |
| `recruiter` | Own candidates/interviews |

Guards: `PrivateRoute`, `OrgWorkspaceRoute`, `AdminRoute`, `PlatformRoute`.  
Backend: `authMiddleware` + inline `req.user.role` checks + `tenantClause`.

### 3.6 Security / ops already present

| Concern | Status |
|---------|--------|
| JWT auth | Yes |
| Tenant isolation | Yes |
| Plan / subscription limits | `planLimits.ts` |
| Rate limiting | Public routes only (`public.ts`, `readiness.ts`) — **not** on AI endpoints |
| Activity audit | `activities` table (candidate-centric) |
| AI token / cost logging | **Missing** |
| Prompt templates externalized | **Missing** |

### 3.7 Testing

Vitest + Supertest under `server/src/__tests__/` (`ai.test.ts`, recommendation tests, etc.). Pattern to follow for new module tests.

---

## 4. Reusable Components (for this feature)

### Backend

1. **`ai.ts` primitives** — `jsonCallResult`, `extractJson`, `aiMode`, `humanizeAiError`, fail-soft pattern  
2. **`screeningQuestions.ts`** — category typing, AI + template fallback pattern  
3. **Auth / tenant middleware** — `authMiddleware`, `tenantMiddleware`, `requireTenant`  
4. **`asyncHandler`** — route error wrapping  
5. **DTO + Mapper pattern** — from job recommendation module  
6. **Migration style** — additive `CREATE TABLE IF NOT EXISTS` / `ALTER … IF NOT EXISTS` in `db.ts` + mirror in `cloud-migrate.sql`  
7. **`activities` logging** — extend or parallel for AI audit  
8. **`express-rate-limit`** — reuse for `/generate`  
9. **Vitest patterns** — mock AI client / schema validation tests

### Frontend

1. **`PageHeader`, `SideDrawer`, `KpiCard`, `StatusBadge`, `Tabs`**  
2. **Form CSS** — `.form-card`, `.input-field`, `.button-pill`, checkbox groups  
3. **AI UX cues** — `.ai-chip`, loading-screen patterns (JobsPage AI generate)  
4. **`api` client** — add methods next to `generateJobDescription` / screening methods  
5. **`Layout` nav** — add “Question Bank” / “AI Questions” under Workspace  
6. **Recharts** — analytics milestone  
7. **Route guards** — wrap new pages in `OrgWorkspaceRoute`

---

## 5. Missing Components

| Layer | Missing |
|-------|---------|
| DB | `interview_question_templates`, `question_categories`, `interview_questions`, `ai_request_history` (+ favourites/archive flags) |
| AI | `AIProvider` interface, multi-provider registry, Claude adapter, per-request provider/model |
| Prompts | External prompt templates + variable interpolation (`{{jobTitle}}`, …) |
| Services | Question generation orchestration, dedupe, retry, export services |
| Routes | Dedicated question-bank CRUD + generate endpoints (non-colliding path) |
| History | Search / reuse / clone / edit / archive / favourite |
| Analytics | Questions generated, skills, models, latency, cost, tokens |
| Frontend | Generator form page, results cards, export actions, history UI, analytics widgets |
| Export | PDF, DOCX, Excel |
| Security | AI-specific rate limit, token usage audit, RBAC matrix for generator |
| Tests | Controller / prompt builder / provider / integration suites |

---

## 6. Suggested Design (Layered — adapted to Node)

```
Route (Controller)
        ↓
InterviewQuestionService          ← validation, orchestration, persistence
        ↓
AIProviderRegistry.generate()     ← provider interface
        ↓
PromptBuilder + PromptTemplate    ← never hardcode final prompts in routes
        ↓
ResponseParser                    ← JSON schema + extractJson + dedupe
        ↓
DTO Mapper                        ← DB rows ↔ API DTOs
        ↓
PostgreSQL                        ← templates, questions, AI history
```

**Never call OpenAI/Ollama from a route handler.** Routes call `InterviewQuestionService` only.

### 6.1 Proposed package layout

```
server/src/
  routes/interviewQuestions.ts          # HTTP controllers
  services/interviewQuestions/
    interviewQuestionService.ts         # orchestration
    promptBuilder.ts
    promptTemplates/
      interview-question-generation.md  # or .json with variables
    responseParser.ts
    questionDeduper.ts
  services/ai/
    AIProvider.ts                       # interface
    OpenAICompatibleProvider.ts         # OpenAI / Ollama / vLLM / GitHub Models
    ClaudeProvider.ts                   # future Anthropic
    providerRegistry.ts
    aiRequestLogger.ts                  # writes ai_request_history
  dto/interviewQuestion.ts
  mappers/interviewQuestionMapper.ts
```

```
client-v2/src/
  pages/InterviewQuestionGeneratorPage.tsx
  pages/InterviewQuestionHistoryPage.tsx
  pages/InterviewQuestionAnalyticsPage.tsx   # or section in Analytics
  components/interviewQuestions/
    GeneratorForm.tsx
    QuestionCard.tsx
    CategoryCheckboxGroup.tsx
    GenerateProgress.tsx
    ExportMenu.tsx
```

### 6.2 Relationship to existing Interview / Screening

| Concern | Module |
|---------|--------|
| Schedule + video + evaluate a candidate | Existing `/api/interviews` |
| Job-linked short screening Qs for live room | Existing `jobs.screening_questions` |
| Reusable AI question bank / templates / exports | **New** `/api/interview-questions` |

Future phases (AI Interviewer, Voice Interview, Copilot) consume the **question bank** + `ai_request_history`, not the calendar `interviews` table alone.

---

## 7. Database Changes

Use **inline migration** (HarmiRecruit convention), not Flyway. Mirror into `scripts/cloud-migrate.sql`.

All tables are **tenant-scoped**.

### 7.1 `question_categories`

| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| tenant_id | INTEGER NULL | NULL = system seed |
| name | TEXT UNIQUE per tenant | Technical, Scenario, Coding, … |
| description | TEXT | |
| is_system | BOOLEAN | seeded defaults |
| created_at | TIMESTAMPTZ | |

Seed: Technical, Scenario, Coding, Behavioural, Leadership, Communication, Architecture, System Design, Cloud, DevOps, Database.

### 7.2 `interview_question_templates`

| Column | Type |
|--------|------|
| id | SERIAL PK |
| tenant_id | INTEGER NOT NULL FK tenants |
| title | TEXT NOT NULL |
| job_role | TEXT |
| department | TEXT |
| experience_level | TEXT |
| employment_type | TEXT |
| industry | TEXT |
| difficulty | TEXT |
| status | TEXT DEFAULT 'active' — active \| archived |
| job_description | TEXT |
| primary_skills | JSONB |
| secondary_skills | JSONB |
| question_count | INTEGER |
| categories | JSONB |
| provider | TEXT |
| model | TEXT |
| is_favourite | BOOLEAN DEFAULT FALSE |
| created_by | INTEGER FK users |
| created_at / updated_at | TIMESTAMPTZ |

### 7.3 `interview_questions`

| Column | Type |
|--------|------|
| id | SERIAL PK |
| tenant_id | INTEGER NOT NULL |
| template_id | INTEGER FK interview_question_templates |
| category_id | INTEGER FK question_categories |
| question | TEXT NOT NULL |
| difficulty | TEXT |
| expected_answer | TEXT |
| evaluation_criteria | TEXT |
| follow_up_question | TEXT |
| estimated_time | TEXT |
| weightage | INTEGER DEFAULT 10 |
| skills | JSONB |
| generated_by_ai | BOOLEAN DEFAULT TRUE |
| sort_order | INTEGER |
| created_at | TIMESTAMPTZ |

Unique index (tenant_id, template_id, lower(question)) for duplicate prevention within a template.

### 7.4 `ai_request_history`

| Column | Type |
|--------|------|
| id | SERIAL PK |
| tenant_id | INTEGER |
| user_id | INTEGER |
| feature | TEXT — e.g. `interview_question_generate` |
| provider | TEXT |
| model | TEXT |
| prompt | TEXT |
| response | TEXT |
| token_usage | JSONB — { prompt, completion, total } |
| cost | NUMERIC(12,6) |
| execution_time_ms | INTEGER |
| status | TEXT — success \| failed \| retry |
| error_message | TEXT |
| template_id | INTEGER NULL |
| created_at | TIMESTAMPTZ |

Indexes: `(tenant_id, created_at DESC)`, `(tenant_id, feature)`, `(tenant_id, model)`.

---

## 8. API Design

**Base path:** `/api/interview-questions` (avoids collision with `/api/interviews`).

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/interview-questions/generate` | Generate + optionally persist template |
| GET | `/api/interview-questions/templates` | List/search templates (q, favourite, status, skill) |
| GET | `/api/interview-questions/templates/:id` | Template + questions |
| PUT | `/api/interview-questions/templates/:id` | Update metadata / questions |
| DELETE | `/api/interview-questions/templates/:id` | Soft-delete → archived (or hard delete admin) |
| POST | `/api/interview-questions/templates/:id/clone` | Clone |
| POST | `/api/interview-questions/templates/:id/favourite` | Toggle favourite |
| POST | `/api/interview-questions/templates/:id/archive` | Archive |
| POST | `/api/interview-questions/:questionId/regenerate` | Regenerate one question |
| GET | `/api/interview-questions/categories` | List categories |
| GET | `/api/interview-questions/analytics` | KPI aggregates |
| GET | `/api/interview-questions/history` | AI request history (filtered) |
| GET | `/api/interview-questions/templates/:id/export` | `?format=pdf\|docx\|xlsx` |

### 8.1 Generate request

```json
{
  "jobTitle": "Senior Java Developer",
  "jobDescription": "...",
  "primarySkills": ["Java", "Spring Boot", "PostgreSQL"],
  "secondarySkills": ["Kafka"],
  "experience": "5-8 years",
  "department": "Engineering",
  "industry": "FinTech",
  "employmentType": "Full-time",
  "numberOfQuestions": 15,
  "difficulty": "medium",
  "categories": ["Technical", "System Design", "Behavioural"],
  "provider": "openai_compatible",
  "model": "gpt-4o",
  "saveAsTemplate": true,
  "title": "Java FinTech Mid-Senior Pack"
}
```

### 8.2 Generate response

```json
{
  "templateId": 42,
  "questions": [
    {
      "id": 1001,
      "question": "...",
      "category": "Technical",
      "difficulty": "medium",
      "expectedAnswer": "...",
      "evaluationCriteria": "...",
      "estimatedTime": "5 min",
      "weightage": 10,
      "followUpQuestion": "...",
      "skills": ["Java", "Spring Boot"]
    }
  ],
  "meta": {
    "provider": "openai_compatible",
    "model": "qwen3:8b",
    "executionTimeMs": 4200,
    "tokenUsage": { "prompt": 1200, "completion": 2400, "total": 3600 }
  }
}
```

Validation: job title required, skills required (≥1), question count 1–50, categories non-empty, difficulty enum, authenticated + tenant required.

---

## 9. Prompt Builder

- Store templates under `promptTemplates/` (markdown or JSON).
- Interpolate: `{{jobTitle}}`, `{{experience}}`, `{{skills}}`, `{{industry}}`, `{{jobDescription}}`, `{{difficulty}}`, `{{questionCount}}`, `{{categories}}`.
- System instruction must require **strict JSON** matching:

```json
{
  "questions": [
    {
      "question": "",
      "category": "",
      "difficulty": "",
      "expectedAnswer": "",
      "evaluationCriteria": "",
      "estimatedTime": "",
      "weightage": 10,
      "followUpQuestion": "",
      "skills": []
    }
  ]
}
```

- Reuse `json_schema` response_format + `extractJson` fallback for local models.
- Never hardcode the full prompt inside the route.

---

## 10. AI Provider Layer

```typescript
interface AIProvider {
  readonly name: string;
  generate(input: AIGenerateRequest): Promise<AIGenerateResult>;
}
```

| Implementation | Backing |
|----------------|---------|
| `OpenAICompatibleProvider` | Existing SDK — OpenAI, Ollama, vLLM, GitHub Models |
| `ClaudeProvider` | Future `@anthropic-ai/sdk` |
| Gemini / Azure / DeepSeek / Mistral | Future adapters or OpenAI-compatible gateways |

**Registry:** resolve by `provider` request field → env default (`AI_*`) → fail with clear error.

**Retries:** 1–2 retries on 429 / transient network; log each attempt in `ai_request_history`.

---

## 11. Security

| Control | Design |
|---------|--------|
| Auth | JWT required on all endpoints |
| Tenant | All rows filtered by `tenant_id` |
| RBAC | `admin`, `recruiter`, `hiring_manager` can generate/read; delete/archive: creator or admin |
| Rate limit | `express-rate-limit` on `/generate` (e.g. 10/min/user) |
| Audit | `ai_request_history` + optional `activities` entry |
| Secrets | Keys only in env; never return raw API keys |
| Prompt injection | Treat JD/skills as untrusted user content; system prompt forbids following embedded instructions |
| Plan limits | Optional generation quota via `planLimits` extension (future) |

---

## 12. Frontend Design (reuse HarmiRecruit UI — not MUI)

Match existing design system (`app.css`), not Material UI, unless product later adopts MUI repo-wide.

### Generator page (`/interview-questions`)

Fields: Job Title, Job Description, Experience, Department, Industry, Employment Type, Primary/Secondary Skills, Number of Questions, Difficulty, Category checkboxes (11 categories), Provider/Model (optional advanced), Generate CTA.

UX: loading animation, progress bar, “AI thinking” state (reuse JobsPage AI loading patterns).

### Results

Card per question: question, difficulty, skill, estimated time, expected answer, evaluation criteria; actions Copy / Edit / Delete / Regenerate; footer Save Template + Export PDF/DOCX/Excel.

### History

Search, reuse, clone, edit, archive, favourite — table/list + `SideDrawer` detail.

### Analytics

Extend `AnalyticsPage` or dedicated section: questions generated, top skills, top models, avg response time, avg cost, token usage (Recharts + `KpiCard`).

---

## 13. Future Scalability

Design the question bank as a **shared AI Interview Platform foundation**:

| Future phase | Consumes |
|--------------|----------|
| AI Interviewer | Template questions + evaluation criteria |
| AI Voice Interview | Same Q set + estimated_time + follow-ups |
| Candidate Evaluation | expected_answer + evaluation_criteria + weightage |
| AI Interview Copilot | Live question suggestions from bank + JD |
| AI Hiring Assistant | History + analytics + skills trends |

Shared contracts:

- `AIProvider` interface (all AI features migrate over time)
- `ai_request_history` (cross-feature cost/latency)
- Prompt template registry (feature-keyed)
- Question bank APIs (stable DTOs)

---

## 14. Milestone Plan (aligned with brief)

| Milestone | Deliverable | Compile check |
|-----------|-------------|---------------|
| **1 — Database** | Tables + seeds in `db.ts` + `cloud-migrate.sql` | `npm run build --prefix server` |
| **2 — Backend CRUD** | Routes, service, mappers, validation (stub AI) | Server build + smoke routes |
| **3 — AI Integration** | Provider layer, prompt builder, parser, generate, history logging, retry/dedupe | Server build + unit tests for prompt/parser |
| **4 — Frontend** | Generator + results + history (CSS design system) | `npm run build --prefix client-v2` |
| **5 — Analytics** | Analytics API + dashboard widgets | Full monorepo build |
| **6 — Testing** | Unit, integration, route, prompt, provider tests | `npm test --prefix server` |

**Rules:** Reuse before inventing; do not break existing `/api/interviews` or job screening; compile after each milestone.

---

## 15. Open Decisions (need confirmation before Milestone 1)

1. **Stack:** Proceed on **Node/Express/React** (recommended) rather than Java/Spring?  
2. **UI:** Stay on **existing CSS design system** rather than introduce Material UI?  
3. **API path:** Confirm `/api/interview-questions` (avoid `/api/interview` collision).  
4. **Claude:** Implement Anthropic adapter in Milestone 3, or Phase 2?  
5. **Export:** Include PDF/DOCX/Excel in Milestone 4, or stub CSV first?  
6. **Screening questions:** Keep independent, or offer “Save to job screening” bridge later?

---

## 16. Summary Verdict

| Question | Answer |
|----------|--------|
| AI module exists? | **Yes** — `services/ai.ts` (OpenAI-compatible) |
| OpenAI? | **Yes** (SDK) |
| Claude? | **No** (docs outdated) |
| Ollama? | **Yes** (via `AI_BASE_URL`) |
| Spring AI? | **No** (not a Java app) |
| Prompt service? | **No** — prompts inline today |
| Interview module? | **Yes** — scheduling/video; **not** question bank |
| Screening AI Qs? | **Yes** — lightweight JD-based; reuse patterns, not tables |
| Auth / RBAC? | **Yes** — JWT + roles + tenant |
| Ready to build? | **Yes**, on existing stack with layered AI architecture |

**Next step:** Approve open decisions in §15 → implement **Milestone 1 (Database)**.
