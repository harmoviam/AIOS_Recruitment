# AI Sourcing Agent — API Contract (Sprint 1)

**Base path:** `/api/ai-sourcing`  
**Auth:** `Authorization: Bearer <jwt>`  
**Tenant:** Resolved from JWT; super-admin may pass `X-Tenant-Slug`  
**Feature flag:** When `AI_SOURCING_ENABLED=false`, secured routes return `403` with `{ error, code: 'AI_SOURCING_DISABLED' }`  
**Errors:** `{ error: string, code?: string }` (project convention)

---

## Permissions (role-mapped)

| Suggested permission | Sprint 1 mapping |
|----------------------|------------------|
| `AI_SOURCING_VIEW` | `admin`, `recruiter`, `hiring_manager`, `super_admin` (with tenant) |
| `AI_SOURCING_SEARCH` | same as VIEW |

Candidate rows always filtered with `candidateScopeSql` (recruiter/HM scoping).

---

## Endpoints

### `GET /health` (public module health)

```json
{
  "status": "ok",
  "module": "ai-sourcing",
  "version": "1.0.0-sprint1",
  "enabled": true,
  "tenantScoped": true
}
```

### `POST /parse`

Parse NL without searching.

**Request**
```json
{ "query": "React developers in Bangalore with 3+ years" }
```

**Response**
```json
{
  "query": "…",
  "criteria": {
    "skills": ["react"],
    "location": "Bangalore",
    "minExperienceYears": 3,
    "keywords": [],
    "jobTitle": "developer"
  },
  "fieldConfidence": {
    "skills": 0.7,
    "location": 0.85,
    "minExperienceYears": 0.9,
    "jobTitle": 0.6
  },
  "parserMode": "heuristic",
  "unresolvedFields": []
}
```

### `POST /search`

Run search (optionally with edited criteria) and persist.

**Request**
```json
{
  "query": "React developers in Bangalore with 3+ years",
  "criteria": { "skills": ["react"], "location": "Bangalore", "minExperienceYears": 3 },
  "limit": 25,
  "offset": 0
}
```

- If `criteria` omitted → parse from `query`.
- If both provided → `criteria` wins (user edit); parser confidence still recorded when parse ran.

**Response**
```json
{
  "id": "uuid",
  "query": "…",
  "criteria": { },
  "fieldConfidence": { },
  "parserMode": "hybrid",
  "resultCount": 12,
  "results": [
    {
      "id": 1,
      "name": "Ada Lovelace",
      "email": "ada@example.com",
      "phone": null,
      "skills": ["react", "typescript"],
      "experienceYears": 5,
      "stage": "screening",
      "location": "Bangalore",
      "jobTitle": "Frontend Engineer",
      "aiScore": 8.2
    }
  ],
  "limit": 25,
  "offset": 0,
  "createdAt": "2026-08-08T00:00:00.000Z"
}
```

### `GET /search/:id`

Tenant-scoped fetch of a prior search (includes `resultPreview` / results).

### `GET /searches/recent?limit=10`

Recent searches for current user within tenant.

### `GET /recommended`

```json
{
  "items": [
    { "label": "React mid-level in Bangalore", "query": "React developers in Bangalore with 3+ years" }
  ]
}
```

---

## Sprint 2 endpoints

### `POST /jobs/:jobId/analyze`

Tenant-scoped JD intelligence. Returns `intelligence`, derived `criteria`, `parserMode`, `promptVersion`.

### `GET /jobs/:jobId/intelligence`

Cached JD intelligence (404 if never analyzed).

### `POST /jobs/:jobId/search`

Analyze (or reuse cached intel) → hybrid search → persist `ai_sourcing_searches` with `job_id`.

### `POST /candidates/:candidateId/intelligence`

Build/refresh `candidate_ai_profiles` (never overwrites `resume_text`).

### `GET /candidates/:candidateId/intelligence`

Cached AI profile.

### `GET /skills` · `POST /skills/normalize`

List ontology skills; normalize + expand skill terms (EKS → kubernetes, aws, …).

Search results additionally include `hybridScore`, `matchSignals`, `expandedSkills`.

---

## Conventions

- Success payloads are **raw JSON objects** (no global `{ data }` envelope) — matches ATS/sourcing.
- Validation via Zod; `400` on schema failure.
- Pagination: `limit` capped (default 25, max 100).
- Parse/search rate-limited: 30/min per user.
