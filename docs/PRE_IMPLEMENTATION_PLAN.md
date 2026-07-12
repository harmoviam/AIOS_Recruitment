# Pre-Implementation Plan — AI Modules

**Status:** Awaiting confirmation — no code changes made  
**Principle:** Extend existing services, routes, models, and UI. Do not duplicate.

---

## 1. Repository Analysis Summary

### Existing Stack

| Area | Location | Pattern |
|------|----------|---------|
| Backend routes | `server/src/routes/*.ts` | One router per domain, mounted in `index.ts` |
| Business logic | `server/src/services/*.ts` | Plain functions, fail-soft for external APIs |
| Migrations | `server/src/db.ts` → `migrate*()` functions | `ADD COLUMN IF NOT EXISTS`, mirrored in `scripts/cloud-migrate.sql` |
| Frontend pages | `client-v2/src/pages/*.tsx` | TopBar + PageHeader + `.page-content` + `.card` |
| UI primitives | `client-v2/src/components/ui/` | 11 reusable components |
| API client | `client-v2/src/api/client.ts` | Single `api` object, `request()` wrapper |
| Types | `client-v2/src/types/index.ts` | Shared domain interfaces |
| Design system | `client-v2/src/styles/app.css` | CSS variables, no component library |

### What Does NOT Exist (confirmed by search)

| Capability | Search Result |
|------------|---------------|
| Resume upload / PDF parsing | No matches for multer, multipart, resume file storage |
| Dedicated resume service | No `resumeParser.ts` or similar |
| Semantic / vector search | No embeddings, pgvector, or semantic routes |
| Per-job structured match scores | Only aggregate `match_percent` on jobs list |
| File upload middleware | Express uses `express.json()` only — no body parser for files |
| Test framework | No vitest/jest in `package.json` |

---

## 2. Similar Functionality Found (Reuse, Don't Recreate)

### Module 1 — Resume Parsing

| Existing | Path | How to Reuse |
|----------|------|--------------|
| **CSV import 3-step flow** | `ImportCandidatesPage.tsx` | Same stepper: Upload → Preview → Save. Reuse `.drop-zone`, `.stepper` CSS |
| **Row parsing logic** | `parseImportRow()` in `candidates.ts` | Already extracts name, email, phone, skills, experience, salary, company, location — map parsed resume fields to same candidate columns |
| **Candidate create** | `POST /api/candidates` | Extend body to accept optional `parsed_profile`; no new create endpoint |
| **Claude JSON extraction** | `jsonCall()` in `ai.ts` | Add `parseResume()` using same pattern as `scoreCandidate()` |
| **Background rescore** | `rescoreCandidate()` in `ai.ts` | Trigger after resume save (already runs on create/update) |
| **Profile edit UI** | `CandidateDetailPage.tsx` profile tab | Extend form fields; same edit/save pattern |
| **Add candidate form** | `AddCandidatePage.tsx` | Add upload zone above existing form; populate fields from parse result |

### Module 2 — Match Score

| Existing | Path | How to Reuse |
|----------|------|--------------|
| **`scoreCandidate()`** | `services/ai.ts` | **Extend** to return multi-dimensional breakdown (strengths, gaps already exist) |
| **`rescoreCandidate()`** | `services/ai.ts` | **Extend** to persist full match record, not just `ai_score` |
| **`computeAiScore()`** | `candidates.ts` | Keep as immediate heuristic; AI replaces in background (existing pattern) |
| **`match_percent` on jobs** | `jobs.ts` GET `/` | Keep unchanged; add new job-detail match data alongside |
| **Screening JSONB pattern** | `candidates.screening` | Same pattern for `match_profile JSONB` or dedicated table |
| **Score display** | `.ai-score`, `.ai-score-large` CSS | Reuse for match percentages |
| **ScorePicker** | `components/ui/ScorePicker.tsx` | Reuse for recruiter override input |
| **Recharts** | `AnalyticsPage.tsx` | Copy `ResponsiveContainer` + chart pattern for radar chart |
| **Pipeline cards** | `PipelinePage.tsx` | Already shows `ai_score`; add match % when job filter active |
| **AI Insights tab** | `CandidateDetailPage.tsx` tab `ai` | Extend to show match breakdown when viewing from job context |

### Module 3 — Semantic Search

| Existing | Path | How to Reuse |
|----------|------|--------------|
| **Keyword search** | `GET /api/candidates?search=` | **Keep unchanged** — ILIKE on name/email |
| **Filter bar** | `CandidatesListPage.tsx` | Extend with experience, salary, notice period filters |
| **RBAC scoping** | `candidates.ts` GET `/` | Reuse identical scoping in semantic search handler |
| **TopBar search** | `TopBar.tsx` | Optional: add `mode=ai` query param routing |
| **Claude intent parsing** | `jsonCall()` in `ai.ts` | Add `parseSearchIntent()` — same fail-soft pattern |
| **Import validate pattern** | `POST /candidates/import/validate` | Similar preview-before-commit for search intent |

---

## 3. Reusable Components Inventory

### Backend Services (extend, do not duplicate)

| Service | File | Extend For |
|---------|------|------------|
| **ai.ts** | `server/src/services/ai.ts` | `parseResume()`, extended `scoreCandidateForJob()`, `parseSearchIntent()`, `rankCandidates()` |
| candidates.ts (route) | `server/src/routes/candidates.ts` | Parse, reparse, semantic search, extended PATCH fields |
| jobs.ts (route) | `server/src/routes/jobs.ts` | Job candidates with match scores, override |
| db.ts | `server/src/db.ts` | New `migrateAiModules()` function |

**Do NOT create:** `resumeParser.ts`, `matchScoring.ts`, `semanticSearch.ts` as separate AI services — all Claude calls stay in `ai.ts`.

**Optional (non-AI only):** `services/fileStorage.ts` for save/read resume files — thin wrapper, no AI logic.

### Frontend UI Components

| Component | File | Reuse For |
|-----------|------|-----------|
| `TopBar` | `components/ui/TopBar.tsx` | Breadcrumbs, search input |
| `PageHeader` | `components/ui/PageHeader.tsx` | Page titles |
| `Tabs` | `components/ui/Tabs.tsx` | Keyword vs AI search toggle |
| `SideDrawer` | `components/ui/SideDrawer.tsx` | Parse preview, match detail |
| `KpiCard` | `components/ui/KpiCard.tsx` | Match score summary |
| `ScorePicker` | `components/ui/ScorePicker.tsx` | Override score input |
| `StatusBadge` | `components/ui/StatusBadge.tsx` | Parse status, confidence level |

### Frontend CSS Classes (from `app.css`)

| Class | Use |
|-------|-----|
| `.drop-zone`, `.drop-zone-title` | Resume upload (already used by CSV import) |
| `.stepper` | Upload → Preview → Save flow |
| `.ai-chip`, `.ai-score`, `.ai-score-large` | Confidence and match scores |
| `.suggestion-item`, `.ai-suggestions` | Strengths, weaknesses, interview areas |
| `.filter-bar`, `.filter-select` | Extended search filters |
| `.form-card`, `.form-grid`, `.input-field` | Parsed field editing |
| `.card`, `.card-heading` | Match breakdown panels |

### Frontend Pages to Modify (not replace)

| Page | Changes |
|------|---------|
| `AddCandidatePage.tsx` | Add resume upload zone + parse preview |
| `ImportCandidatesPage.tsx` | Link "Or upload a resume" → AddCandidatePage |
| `CandidateDetailPage.tsx` | Profile tab: parsed sections, reparse button, download link |
| `JobsPage.tsx` | Click job → show match-ranked candidates (drawer or inline expand) |
| `CandidatesListPage.tsx` | AI search mode + extended filters |
| `PipelinePage.tsx` | Show match % when `job_id` filter set |

**Do NOT create** a separate design system or new page routing structure unless a job detail view truly requires `/jobs/:id` — prefer extending `JobsPage` with `SideDrawer` first to minimize structural change.

---

## 4. Database Model Strategy (Extend, Don't Replace)

### Follow Existing JSONB Patterns

The codebase stores structured scorecards as JSONB on parent rows:

| Column | Table | Pattern |
|--------|-------|---------|
| `screening` | `candidates` | Pre-screen scorecard |
| `evaluation` | `interviews` | BPO interview scorecard |
| `skills` | `candidates` | JSON array |

### Proposed Additive Changes Only

**Migration function:** `migrateAiModules()` in `db.ts` + mirror in `cloud-migrate.sql`

#### Extend `candidates` table

```sql
-- Resume parsing (Module 1)
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS parsed_profile JSONB;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS resume_meta JSONB;
-- resume_meta: { filename, mime_type, storage_path, file_size, ai_confidence, parsed_at }

-- Profile fields (Module 1) — nullable, backward compatible
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS linkedin TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS github TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS portfolio TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS current_company TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS current_location TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS preferred_location TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS notice_period TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS current_salary TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS professional_summary TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS education JSONB DEFAULT '[]';
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS experience JSONB DEFAULT '[]';
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS projects JSONB DEFAULT '[]';
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS certifications JSONB DEFAULT '[]';
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS languages JSONB DEFAULT '[]';
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS technical_skills JSONB DEFAULT '[]';
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS soft_skills JSONB DEFAULT '[]';
```

**Rationale:** Avoid a separate `candidate_resumes` table initially — store file metadata in `resume_meta JSONB` and file on disk. Reparse updates same columns. If audit history is needed later, add table in a follow-up migration.

#### New table for per-job match (Module 2)

Required because match is `(candidate_id, job_id)` relational and needs sorting/indexing:

```sql
CREATE TABLE IF NOT EXISTS candidate_job_matches (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  overall_match REAL NOT NULL DEFAULT 0,
  dimensions JSONB NOT NULL DEFAULT '{}',
  -- dimensions: { technical, skill, experience, location, education, communication, culture_fit }
  strengths JSONB DEFAULT '[]',
  weaknesses JSONB DEFAULT '[]',
  missing_skills JSONB DEFAULT '[]',
  recommended_interview_areas JSONB DEFAULT '[]',
  ai_summary TEXT,
  override_score REAL,
  override_by INTEGER REFERENCES users(id),
  override_at TIMESTAMPTZ,
  override_reason TEXT,
  scored_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, candidate_id, job_id)
);
CREATE INDEX IF NOT EXISTS idx_cjm_job_score
  ON candidate_job_matches(tenant_id, job_id, overall_match DESC);
```

**Existing `ai_score` on candidates:** Unchanged. Continues as general employability score. Job-specific match lives in `candidate_job_matches`.

**Existing `match_percent` on jobs list:** Unchanged. Can optionally recompute from `candidate_job_matches` avg later.

#### Optional audit (Module 3)

```sql
CREATE TABLE IF NOT EXISTS search_queries (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id),
  query_text TEXT NOT NULL,
  query_type TEXT NOT NULL DEFAULT 'semantic',
  parsed_intent JSONB,
  result_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 5. API Design (Extend Existing Routes)

### Module 1 — Add to `routes/candidates.ts`

| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/candidates/parse-resume` | Multipart upload → preview JSON (no DB write) |
| POST | `/api/candidates/:id/reparse-resume` | Re-parse stored file, return preview |
| GET | `/api/candidates/:id/resume` | Download original file |

**Extend existing endpoints (backward compatible):**

| Method | Path | Addition |
|--------|------|----------|
| POST | `/api/candidates` | Accept optional `parsed_profile`, `resume_meta`; map fields to columns |
| PATCH | `/api/candidates/:id` | Accept new profile fields (linkedin, experience JSONB, etc.) |

**Middleware addition:** `multer` or `busboy` for multipart — only on parse routes. Rest of API stays JSON.

### Module 2 — Add to `routes/jobs.ts`

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/jobs/:id/matches` | Candidates for job, sorted by effective score |
| GET | `/api/jobs/:id/matches/:candidateId` | Single match detail + dimensions |
| POST | `/api/jobs/:id/matches/:candidateId/rescore` | Trigger rescore |
| PATCH | `/api/jobs/:id/matches/:candidateId` | Set/clear override_score |

**Extend `GET /api/candidates`:** Add optional `sort=match&job_id=X` when job context provided.

### Module 3 — Add to `routes/candidates.ts`

| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/candidates/search/semantic` | NL query + filters → ranked results |

**Existing `GET /api/candidates?search=keyword`:** Unchanged.

### API Pattern Checklist (match existing code)

- [x] `authMiddleware` → `tenantMiddleware` → `requireTenant`
- [x] `tid(req)` for tenant ID
- [x] `tenantClause()` for SQL isolation
- [x] RBAC scoping copied from existing GET `/candidates`
- [x] `{ error: "message" }` error responses
- [x] Activity log on significant actions (`activities` table)
- [x] `aiMode() === 'disabled'` → graceful fallback

---

## 6. Service Extension Plan (`services/ai.ts` only)

All new AI functions added to existing file:

```typescript
// Module 1
export async function parseResume(text: string, filename: string): Promise<ParsedProfile | null>

// Module 2 — extend existing scoreCandidate
export interface JobMatchScore extends CandidateScore {
  overall_match: number;       // 0–100
  dimensions: { technical, skill, experience, location, education, communication, culture_fit };
  missing_skills: string[];
  recommended_interview_areas: string[];
}
export async function scoreCandidateForJob(input: CandidateScoreInput & { jobId: number }): Promise<JobMatchScore | null>
export async function rescoreJobMatch(tenantId: number, candidateId: number, jobId: number): Promise<void>

// Module 3
export async function parseSearchIntent(query: string): Promise<SearchIntent | null>
export async function rankCandidatesByQuery(query: string, candidates: CandidateSummary[]): Promise<RankedCandidate[]>
```

**Non-AI helper (optional new file):**

```typescript
// services/fileStorage.ts — no AI, just I/O
export async function saveResumeFile(tenantId: number, buffer: Buffer, filename: string): Promise<string>
export async function readResumeFile(storagePath: string): Promise<Buffer>
export function resumeStoragePath(tenantId: number, filename: string): string
```

---

## 7. Frontend Extension Plan

### API client (`api/client.ts`) — add methods to existing `api` object

```typescript
parseResumePreview: (file: File) => FormData POST
reparseResume: (candidateId: number) => POST
downloadResume: (candidateId: number) => blob
getJobMatches: (jobId: number) => GET
overrideMatchScore: (jobId, candidateId, score, reason) => PATCH
rescoreMatch: (jobId, candidateId) => POST
semanticSearch: (query, filters) => POST
```

### Types (`types/index.ts`) — extend existing interfaces

```typescript
// Extend Candidate with optional new fields
// Add ParsedProfile, JobMatchScore, SearchIntent, RankedCandidate
```

### New components (minimal)

| Component | Location | Reason |
|-----------|----------|--------|
| `ResumeUploadZone.tsx` | `components/` | Shared by AddCandidate + Detail reparse |
| `MatchRadarChart.tsx` | `components/` | Recharts radar — no existing radar component |

All other UI built by composing existing `SideDrawer`, `Tabs`, `PageHeader`, etc.

---

## 8. Dependencies to Add

| Package | Purpose | Where |
|---------|---------|-------|
| `multer` + `@types/multer` | Multipart file upload | `server/` |
| `pdf-parse` | PDF text extraction | `server/` |
| `mammoth` | DOCX text extraction | `server/` |
| `vitest` + `supertest` | Tests | `server/` devDependencies |

No new frontend dependencies — Recharts already installed.

---

## 9. Implementation Phases

### Phase 1 — Module 1: AI Resume Parser

| Step | Files Touched |
|------|---------------|
| 1. Migration | `db.ts`, `cloud-migrate.sql` |
| 2. File storage helper | `services/fileStorage.ts` (new, non-AI) |
| 3. AI parse function | `services/ai.ts` (extend) |
| 4. Parse routes | `routes/candidates.ts` (extend) |
| 5. Extend create/patch | `routes/candidates.ts` |
| 6. Types | `types/index.ts` |
| 7. API client | `api/client.ts` |
| 8. Upload UI | `AddCandidatePage.tsx`, `ResumeUploadZone.tsx` |
| 9. Detail UI | `CandidateDetailPage.tsx` |
| 10. Tests | `server/src/__tests__/resumeParser.test.ts` |
| 11. Docs | `docs/API_AI_MODULES.md`, `CHANGELOG.md` |

**Estimated new files:** 3 (`fileStorage.ts`, `ResumeUploadZone.tsx`, test file)  
**Estimated modified files:** 8

### Phase 2 — Module 2: AI Match Score

| Step | Files Touched |
|------|---------------|
| 1. Migration | `db.ts`, `cloud-migrate.sql` |
| 2. Extend scoring | `services/ai.ts` |
| 3. Match routes | `routes/jobs.ts` (extend) |
| 4. Trigger on create/update | `routes/candidates.ts` |
| 5. Types + API client | `types/index.ts`, `api/client.ts` |
| 6. Job match UI | `JobsPage.tsx`, `MatchRadarChart.tsx`, `SideDrawer` |
| 7. Pipeline badge | `PipelinePage.tsx` |
| 8. Tests | `server/src/__tests__/matchScoring.test.ts` |

### Phase 3 — Module 3: Semantic Search

| Step | Files Touched |
|------|---------------|
| 1. Migration (audit table) | `db.ts`, `cloud-migrate.sql` |
| 2. Search functions | `services/ai.ts` |
| 3. Search route | `routes/candidates.ts` |
| 4. Types + API client | `types/index.ts`, `api/client.ts` |
| 5. Search UI | `CandidatesListPage.tsx`, `Tabs` for mode toggle |
| 6. Tests | `server/src/__tests__/semanticSearch.test.ts` |

---

## 10. Structural Change Approval Required

The following are the **only structural additions** proposed. Please confirm before implementation:

| Change | Reason | Alternative if rejected |
|--------|--------|-------------------------|
| New table `candidate_job_matches` | Per-job match requires relational data + sort index | Store in JSONB on candidates keyed by job_id (worse query performance) |
| New file `services/fileStorage.ts` | Thin I/O layer, no AI duplication | Inline file I/O in candidates route |
| New component `ResumeUploadZone.tsx` | Shared upload UI | Inline in AddCandidatePage only |
| New component `MatchRadarChart.tsx` | No existing radar chart | List-only match breakdown, no chart |
| `multer` dependency | Required for file upload | None — must add |
| Optional table `search_queries` | Audit trail for semantic search | Skip audit table |

**Explicitly NOT proposing:**
- New route file `routes/resumes.ts` — stays in `candidates.ts`
- New AI service files — all in `ai.ts`
- New frontend pages/routes — extend existing pages
- New styling framework
- Replacement of `ai_score` or keyword search

---

## 11. Confirmation Checklist

Please confirm before Module 1 implementation:

- [ ] **Extend `ai.ts`** instead of creating separate AI services
- [ ] **Extend `candidates.ts` / `jobs.ts` routes** instead of new route modules
- [ ] **JSONB on candidates** for resume metadata + parsed profile
- [ ] **`candidate_job_matches` table** for Module 2 (or prefer JSONB alternative)
- [ ] **Extend existing pages** rather than new `/jobs/:id` route
- [ ] **File storage:** local `uploads/` for dev, GCS env var for production
- [ ] **Implementation order:** Module 1 → 2 → 3, commit after each

---

**No code has been written. Awaiting your confirmation to proceed with Module 1.**
