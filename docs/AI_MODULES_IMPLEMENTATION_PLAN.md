# AI Modules — Implementation Plan

**Project:** HarmoviaJobs / AIOS Recruitment  
**Date:** July 2026  
**Status:** Planning (Step 1 complete — awaiting approval per module)

This document defines the proposed design for three AI modules. Each module will be implemented, tested, documented, and committed separately after approval.

---

## Module Overview

| Module | Name | Primary Value |
|--------|------|---------------|
| 1 | AI Resume Parser | Extract structured profile from PDF/DOC/DOCX; auto-populate candidate |
| 2 | AI Resume Match Score | Job-specific multi-dimensional match with radar chart and override |
| 3 | Semantic Candidate Search | Natural language search with semantic ranking + existing keyword search |

---

## Module 1: AI Resume Parser

### 1.1 User Stories

1. Recruiter uploads a resume (PDF, DOC, DOCX) when adding a candidate
2. System extracts structured fields using Claude
3. Recruiter reviews/edits parsed data in a preview screen before saving
4. Original file, parsed JSON, and confidence score are stored
5. Recruiter can trigger "Reparse Resume" from candidate detail

### 1.2 Fields to Extract

| Category | Fields |
|----------|--------|
| Contact | Name, Email, Phone, LinkedIn, GitHub, Portfolio |
| Employment | Current Company, Previous Companies (array) |
| Experience | Work history (title, company, dates, description) |
| Education | Degree, institution, year |
| Skills | Skills, Technical Skills, Soft Skills |
| Projects | Project name, description, technologies |
| Certifications | Name, issuer, date |
| Compensation | Current Salary, Expected Salary, Notice Period |
| Location | Current Location, Preferred Location |
| Other | Languages, Professional Summary |

### 1.3 Database Changes (Migration)

**New table: `candidate_resumes`**

```sql
CREATE TABLE IF NOT EXISTS candidate_resumes (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  candidate_id INTEGER REFERENCES candidates(id) ON DELETE CASCADE,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  storage_path TEXT NOT NULL,          -- local path or GCS URI
  parsed_profile JSONB,                -- structured extraction result
  ai_confidence REAL,                  -- 0.0–1.0 overall confidence
  parse_status TEXT NOT NULL DEFAULT 'pending',  -- pending|parsed|failed
  parse_error TEXT,
  parsed_at TIMESTAMPTZ,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_candidate_resumes_tenant ON candidate_resumes(tenant_id);
CREATE INDEX idx_candidate_resumes_candidate ON candidate_resumes(candidate_id);
```

**Extend `candidates` table (additive columns):**

```sql
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
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS parsed_profile JSONB;  -- latest parsed snapshot
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS resume_id INTEGER REFERENCES candidate_resumes(id);
```

All existing columns preserved. New columns nullable for backward compatibility.

### 1.4 Backend Design

**New service:** `server/src/services/resumeParser.ts`

| Function | Purpose |
|----------|---------|
| `extractTextFromFile(buffer, mimeType)` | Extract plain text from PDF/DOC/DOCX |
| `parseResumeWithAI(text, filename)` | Claude structured extraction → `ParsedProfile` |
| `storeResumeFile(tenantId, buffer, filename, mimeType)` | Save to `uploads/{tenant_id}/` (local) or GCS |
| `computeConfidence(parsed)` | Derive confidence from field completeness + AI self-assessment |

**Text extraction libraries (to add):**
- PDF: `pdf-parse` or `pdfjs-dist`
- DOCX: `mammoth`
- DOC: `mammoth` (limited) or convert via LibreOffice headless (production fallback)

**New routes:** `server/src/routes/resumes.ts`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/resumes/parse` | JWT + tenant | Upload file, parse, return preview (no save) |
| POST | `/api/resumes/:id/reparse` | JWT + tenant | Re-parse existing stored resume |
| GET | `/api/resumes/:id/download` | JWT + tenant | Download original file |
| GET | `/api/candidates/:id/resume` | JWT + tenant | Get resume metadata + parsed profile |

**Parse flow (preview):**
```
POST /api/resumes/parse (multipart/form-data)
  → validate file type + size (max 10MB)
  → extract text
  → parseResumeWithAI(text)
  → return { parsed_profile, ai_confidence, preview_id? }
  → recruiter edits in UI
  → POST /api/candidates (existing) with parsed fields + resume attachment
```

**Integration with existing candidate create:**
- Extend `POST /api/candidates` to accept optional `resume_id` or inline resume upload
- On create with resume: link `candidate_resumes.candidate_id`, populate fields from parsed profile
- Fire `rescoreCandidate()` after save (existing behavior)

### 1.5 Frontend Design

**Modify:** `AddCandidatePage.tsx`
- Add "Upload Resume" section above manual form
- File drop zone (reuse `.form-card`, `.input-field` patterns)
- On upload → call `api.parseResume(file)` → populate form fields
- Show confidence badge (`.ai-chip`)
- Allow edit before submit

**New component:** `components/ResumeUploadZone.tsx`
- Drag-and-drop + file picker
- Supported formats indicator
- Loading state during parse
- Error display

**Modify:** `CandidateDetailPage.tsx` — Profile tab
- Show parsed profile sections (experience, education, projects)
- "Reparse Resume" button → confirmation → `api.reparseResume(id)`
- Link to download original resume
- Display AI confidence score

**New API methods in `client.ts`:**
```typescript
parseResume: (file: File) => FormData upload
reparseResume: (resumeId: number) => POST
getCandidateResume: (candidateId: number) => GET
downloadResume: (resumeId: number) => blob download
```

### 1.6 AI Prompt Design

Reuse `jsonCall()` pattern from `services/ai.ts`:

```typescript
interface ParsedProfile {
  name: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  github?: string;
  portfolio?: string;
  current_company?: string;
  previous_companies?: string[];
  experience?: { title: string; company: string; start_date?: string; end_date?: string; description?: string }[];
  education?: { degree: string; institution: string; year?: string }[];
  projects?: { name: string; description?: string; technologies?: string[] }[];
  skills?: string[];
  technical_skills?: string[];
  soft_skills?: string[];
  certifications?: { name: string; issuer?: string; date?: string }[];
  current_salary?: string;
  expected_salary?: string;
  notice_period?: string;
  current_location?: string;
  preferred_location?: string;
  languages?: string[];
  professional_summary?: string;
  confidence: number;  // 0.0–1.0 self-assessed
}
```

System prompt: recruitment resume parser, extract only what is present, use null for missing fields, normalize phone formats, infer skills from experience when not explicitly listed.

### 1.7 Tests

| Type | Coverage |
|------|----------|
| Unit | `extractTextFromFile` for each mime type, `computeConfidence`, schema validation |
| Integration | Parse endpoint with sample PDF/DOCX fixtures |
| API | Auth, tenant isolation, file size limits, invalid mime rejection |

---

## Module 2: AI Resume Match Score

### 2.1 User Stories

1. Inside Job Details, recruiter sees each candidate's multi-dimensional match score
2. Scores include: Overall, Technical, Skill, Experience, Location, Education, Communication, Culture Fit
3. AI generates Strengths, Weaknesses, Missing Skills, Recommended Interview Areas
4. Radar chart visualizes dimensions
5. Candidates auto-sorted by match score
6. Recruiter can override the overall score

### 2.2 Database Changes (Migration)

**New table: `candidate_job_matches`**

```sql
CREATE TABLE IF NOT EXISTS candidate_job_matches (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  overall_match REAL NOT NULL DEFAULT 0,       -- 0–100
  technical_match REAL,
  skill_match REAL,
  experience_match REAL,
  location_match REAL,
  education_match REAL,
  communication_score REAL,
  culture_fit REAL,
  strengths JSONB DEFAULT '[]',
  weaknesses JSONB DEFAULT '[]',
  missing_skills JSONB DEFAULT '[]',
  recommended_interview_areas JSONB DEFAULT '[]',
  ai_summary TEXT,
  override_score REAL,                         -- recruiter override (0–100)
  override_by INTEGER REFERENCES users(id),
  override_at TIMESTAMPTZ,
  override_reason TEXT,
  scored_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, candidate_id, job_id)
);
CREATE INDEX idx_matches_job ON candidate_job_matches(tenant_id, job_id, overall_match DESC);
CREATE INDEX idx_matches_candidate ON candidate_job_matches(tenant_id, candidate_id);
```

**Extend `jobs` table (optional, for job requirements):**

```sql
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS required_skills JSONB DEFAULT '[]';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS preferred_skills JSONB DEFAULT '[]';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS min_experience_years REAL;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS max_experience_years REAL;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS required_education TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS salary_range TEXT;
```

### 2.3 Backend Design

**New service:** `server/src/services/matchScoring.ts`

| Function | Purpose |
|----------|---------|
| `scoreCandidateForJob(candidate, job, parsedProfile?)` | Claude multi-dimensional scoring |
| `computeMatchRecord(tenantId, candidateId, jobId)` | Full score + persist |
| `rescoreJobCandidates(tenantId, jobId)` | Batch rescore all candidates for a job |
| `getEffectiveScore(match)` | Returns `override_score ?? overall_match` |

**Extend `services/ai.ts` or new service** with structured schema:

```typescript
interface JobMatchScore {
  overall_match: number;        // 0–100
  technical_match: number;
  skill_match: number;
  experience_match: number;
  location_match: number;
  education_match: number;
  communication_score: number;
  culture_fit: number;
  strengths: string[];
  weaknesses: string[];
  missing_skills: string[];
  recommended_interview_areas: string[];
  ai_summary: string;
}
```

**New/extended routes:**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/jobs/:id/matches` | List candidates with match scores for job (sorted by effective score) |
| GET | `/api/jobs/:id/matches/:candidateId` | Single match detail |
| POST | `/api/jobs/:id/matches/:candidateId/score` | Trigger/rescore single match |
| POST | `/api/jobs/:id/matches/rescore-all` | Batch rescore all candidates |
| PATCH | `/api/jobs/:id/matches/:candidateId/override` | Set/clear override score |

**Triggers for auto-scoring:**
- Candidate created/updated with `job_id` → background `computeMatchRecord`
- Job description updated → optional batch rescore
- Resume parsed/reparsed → rescore linked candidate

**Backward compatibility:**
- Existing `ai_score` on candidates unchanged
- Existing `match_percent` on jobs (avg ai_score) remains; new job detail view uses structured matches

### 2.4 Frontend Design

**New page or drawer:** Job Match View (accessible from Jobs page)

**Modify:** `JobsPage.tsx`
- Job card click → expand or navigate to `/jobs/:id` (new detail route)
- Show match-ranked candidate list

**New page:** `JobDetailPage.tsx` (or extend JobsPage with detail panel)
- Job info header
- Candidate match table sorted by `effective_score`
- Columns: Name, Overall Match %, Technical, Skill, Experience, Location, Stage, Actions
- Click candidate → match detail drawer

**New component:** `components/MatchRadarChart.tsx`
- Recharts `RadarChart` with 8 dimensions
- Reuse chart patterns from `AnalyticsPage.tsx`

**New component:** `components/MatchScorePanel.tsx`
- Overall match badge
- Dimension breakdown list
- Strengths / Weaknesses / Missing Skills sections
- Recommended Interview Areas
- Override score input + reason (admin/recruiter)

**Modify:** `PipelinePage.tsx` / `CandidatesListPage.tsx`
- Optional sort by match when `job_id` filter active
- Show match % badge on cards when available

### 2.5 Tests

| Type | Coverage |
|------|----------|
| Unit | `getEffectiveScore`, schema validation, dimension normalization |
| Integration | Score computation with mock Claude response |
| API | Override permissions, tenant isolation, sort order |

---

## Module 3: Semantic Candidate Search

### 3.1 User Stories

1. Recruiter enters natural language query: "Need Azure DevOps Engineer in Mohali with Terraform and Kubernetes"
2. System understands intent, skills, location, experience level
3. Results ranked by semantic similarity
4. Existing keyword search remains available (toggle or separate input)
5. Filters: Experience, Salary, Notice Period, Location, Availability, Current Employer

### 3.2 Approach Options

**Recommended: Hybrid Claude Ranking (Phase 1)**

Avoid pgvector/embedding infrastructure initially. Use Claude to:
1. Parse query into structured intent (skills, location, experience, availability keywords)
2. Fetch candidate pool via existing SQL filters
3. Rank top N candidates by semantic fit via Claude batch scoring

**Future enhancement:** pgvector embeddings on `parsed_profile` + `professional_summary` for scale.

### 3.3 Database Changes (Migration)

**New table: `search_queries` (optional audit log):**

```sql
CREATE TABLE IF NOT EXISTS search_queries (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id),
  query_text TEXT NOT NULL,
  query_type TEXT NOT NULL DEFAULT 'semantic',  -- semantic|keyword
  parsed_intent JSONB,
  result_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Extend `candidates` for search filters (if not already covered by Module 1):**
- `notice_period`, `current_company`, `current_location`, `preferred_location` (from Module 1)
- Consider `availability_status TEXT` (immediate|15_days|30_days|60_days|negotiable)

### 3.4 Backend Design

**New service:** `server/src/services/semanticSearch.ts`

| Function | Purpose |
|----------|---------|
| `parseSearchIntent(query)` | Claude → structured intent |
| `buildFilterSql(intent, existingFilters)` | Combine with SQL WHERE clauses |
| `rankCandidates(query, candidates[])` | Claude semantic ranking → scored list |
| `searchCandidates(tenantId, query, filters, user)` | Orchestrate full search |

**Parsed intent schema:**

```typescript
interface SearchIntent {
  role_title?: string;
  skills: string[];
  skill_synonyms: string[];       // e.g. "k8s" → "kubernetes"
  locations: string[];
  min_experience_years?: number;
  max_experience_years?: number;
  availability?: string;          // immediate, 15_days, etc.
  industry?: string;
  current_employer_exclude?: string[];
  salary_max?: number;
  notice_period_max_days?: number;
  raw_interpretation: string;     // human-readable parse explanation
}
```

**New route:**

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/candidates/search/semantic` | Natural language search |
| GET | `/api/candidates/search/semantic/preview` | Parse query only (show interpreted intent) |

**Request body:**
```json
{
  "query": "Need Java Architect in Bangalore with Banking experience",
  "filters": {
    "experience_min": 8,
    "location": "Bangalore",
    "notice_period": "immediate",
    "salary_max": "2500000",
    "current_employer": "exclude:Infosys"
  },
  "limit": 50
}
```

**Response:**
```json
{
  "intent": { ... },
  "results": [
    {
      "candidate": { ... },
      "relevance_score": 92,
      "match_reasons": ["8+ years Java", "Bangalore-based", "Banking domain in previous role"]
    }
  ],
  "total": 12,
  "search_type": "semantic"
}
```

**Backward compatibility:**
- Existing `GET /api/candidates?search=keyword` unchanged
- Frontend adds separate "AI Search" mode

### 3.5 Frontend Design

**Modify:** `CandidatesListPage.tsx`
- Toggle: "Keyword" | "AI Search" (tab or segmented control)
- AI Search input with placeholder examples
- Show parsed intent chips below input ("Skills: Java, Spring", "Location: Bangalore")
- Results show `relevance_score` badge + `match_reasons`
- Extended filter bar: Experience range, Salary, Notice Period, Location, Availability, Current Employer

**Modify:** `TopBar.tsx` (optional)
- Global AI search could route to `/candidates?mode=ai&q=...`

**New component:** `components/SemanticSearchBar.tsx`
- Natural language input
- Example query suggestions
- Intent preview panel
- Loading/ranking indicator

### 3.6 Tests

| Type | Coverage |
|------|----------|
| Unit | Intent parsing schema, filter SQL builder, synonym expansion |
| Integration | End-to-end search with seeded candidates |
| API | RBAC scoping (recruiter sees only own candidates), empty query handling |

---

## Cross-Module Dependencies

```
Module 1 (Resume Parser)
    ↓ provides parsed_profile, skills, experience, location
Module 2 (Match Score) ← uses parsed data for richer scoring
    ↓ match scores available for ranking
Module 3 (Semantic Search) ← uses parsed profile + match scores for ranking
```

**Recommended implementation order:** 1 → 2 → 3 (each builds on prior data).

---

## Shared Infrastructure Additions

### File Storage

| Environment | Strategy |
|-------------|----------|
| Development | `server/uploads/{tenant_id}/{uuid}.{ext}` |
| Production | GCS bucket `harmoviajobs-resumes` with tenant prefix |

Env vars to add:
```env
RESUME_STORAGE=local|gcs
RESUME_MAX_SIZE_MB=10
GCS_BUCKET=harmoviajobs-resumes
```

### Test Framework Setup

Add to `server/package.json`:
```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "vitest": "^3.x",
    "supertest": "^7.x"
  }
}
```

Test directory: `server/src/__tests__/`

### API Documentation

New file: `docs/API_AI_MODULES.md` — OpenAPI-style docs for all new endpoints.

### Changelog

New file: `CHANGELOG.md` — entry per module release.

---

## UI/UX Guidelines

1. **Reuse existing design system** — `.card`, `.form-card`, `.ai-chip`, `.ai-score`, `.button-primary`
2. **Dark mode compatible** — use CSS variables, not hardcoded colors
3. **Responsive** — mobile-first, test on bottom nav layout
4. **Loading states** — AI operations may take 3–10s; show spinner + "Parsing resume..." text
5. **Error handling** — fail-soft like existing AI; show "AI unavailable, enter manually" fallback
6. **Feature gating** — use `can('ai_insights')` for AI features; show upgrade prompt on starter plan

---

## Security Considerations

1. **File upload validation** — mime type check, magic bytes, size limit, virus scan (production)
2. **Tenant isolation** — all resume/match/search queries scoped by `tenant_id`
3. **RBAC** — recruiters see only their candidates in search/match results
4. **PII in resumes** — parsed data contains sensitive info; no cross-tenant leakage
5. **Rate limiting** — consider per-tenant limits on parse/search to control AI costs

---

## Approval Checklist

Before implementing each module, confirm:

- [ ] Schema design approved
- [ ] API endpoints approved
- [ ] UI wireframe/approach approved
- [ ] File storage strategy approved (local vs GCS)
- [ ] AI cost/usage expectations understood

---

## Module 1 Ready for Implementation

All analysis complete. **Awaiting your approval to proceed with Module 1: AI Resume Parser.**

Upon approval, implementation will include:
1. Database migration
2. `resumeParser.ts` service
3. Resume routes
4. Extended candidate create/update
5. Frontend upload + preview UI
6. Unit + integration + API tests
7. API documentation
8. CHANGELOG entry
9. Git commit
