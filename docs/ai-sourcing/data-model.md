# AI Sourcing Agent — Data Model

**Date:** 2026-08-08

---

## 1. Existing entities (reuse — do not duplicate)

### Tenant
`tenants(id, slug, name, plan, status, features JSONB, …)`

### User / Recruiter
`users(id, email, role, tenant_id, company_id, managed_by_id, …)`  
Recruiters are users with `role = 'recruiter'`.

### Candidate (search target)
Key fields used by Sprint 1 structured search:

| Column | Use |
|--------|-----|
| `tenant_id` | Isolation |
| `recruiter_id` | RBAC scope |
| `name`, `email`, `phone` | Identity / preview |
| `skills` JSONB | Skill filters |
| `technical_skills`, `soft_skills` | Optional skill union |
| `experience_years` | Min/max experience |
| `current_location`, `preferred_location` | Location ILIKE |
| `stage` | Pipeline stage filter |
| `job_id` + join `jobs.title` | Title / role signal |
| `search_tsv` | Keyword / FTS |
| `ai_score`, `ats_score` | Result ranking signal |
| `salary_expectation` | Soft filter (text; Sprint 1 light touch) |

### Job / Application
Used only for display joins (`job_title`) and future job-linked sourcing. No new job tables in Sprint 1.

### Related existing (do not confuse)

| Table | Purpose |
|-------|---------|
| `people_search_run` | External PDL runs (Sourcing Copilot) |
| `recommendation_run` | Channel recommendation runs |
| `sourcing_*` masters | Channel intelligence |

---

## 2. Sprint 1 migration (implemented)

### `ai_sourcing_searches`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | `gen_random_uuid()` |
| `tenant_id` | INT FK → tenants | CASCADE |
| `user_id` | INT FK → users | Nullable on user delete SET NULL |
| `query_text` | TEXT | Original NL |
| `criteria_json` | JSONB | Canonical `CandidateSearchCriteria` |
| `field_confidence` | JSONB | Per-field 0–1 scores |
| `result_count` | INT | Total matches |
| `result_preview` | JSONB | Top N rows for GET-by-id |
| `parser_mode` | VARCHAR(40) | `heuristic` \| `llm` \| `hybrid` |
| `created_at` | TIMESTAMPTZ | Default NOW() |

Indexes:
- `(tenant_id, user_id, created_at DESC)`
- `(tenant_id, created_at DESC)`

### `ai_sourcing_search_filters`

**Not migrated in Sprint 1.** Criteria live in `criteria_json`.  
Future normalized form (design only):

```
ai_sourcing_search_filters (
  id UUID PK,
  search_id UUID FK → ai_sourcing_searches ON DELETE CASCADE,
  field_key TEXT,          -- e.g. skills, location
  field_value JSONB,
  confidence REAL,
  source TEXT              -- parsed | user_edited
)
```

---

## 3. CandidateSearchCriteria (logical)

```ts
{
  skills?: string[];
  keywords?: string[];
  jobTitle?: string;
  location?: string;
  minExperienceYears?: number | null;
  maxExperienceYears?: number | null;
  stage?: string | null;
  minAiScore?: number | null;
}
```

`field_confidence` mirrors keys with values in `[0, 1]`.

---

## 4. Phase roadmap tables (design only — do not migrate yet)

Documented for planning; **not created in Sprint 1**.

| Table | Purpose | Suggested phase |
|-------|---------|-----------------|
| `ai_sourcing_search_filters` | Normalized filter rows | Sprint 2 |
| `ai_sourcing_saved_queries` | Named bookmarks / team shares | Sprint 3 |
| `ai_sourcing_result_feedback` | Thumbs / hired outcomes for learning | Sprint 4+ |
| `ai_sourcing_embeddings` | Candidate chunk vectors | Later (needs vector infra) |
| `ai_sourcing_outreach_drafts` | Message drafts from results | Later |
| `ai_sourcing_boolean_queries` | Advanced Boolean AST | Later |

---

## 5. ER (Sprint 1)

```
tenants 1──* ai_sourcing_searches *──1 users
candidates (read-only for search; no FK from searches)
```

Searches store a **preview snapshot** (`result_preview`) so GET-by-id remains stable even if candidates change; live re-run can be a later enhancement.
