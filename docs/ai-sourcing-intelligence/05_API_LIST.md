# 5. API List (Node / Express)

**Version:** 2.0  
**Base path:** `/api/sourcing`  
**Auth:** existing `Authorization: Bearer <JWT>` + tenant middleware  

Common list query params: `page`, `pageSize`, `sort`, `status`, `q`.

---

## 5.1 Master Data (Sprint 2–3)

| Resource | Endpoints |
|----------|-----------|
| Countries | `GET/POST /countries`, `GET/PUT/PATCH /countries/:id` |
| States | `GET/POST /states`, `GET/PUT/PATCH /states/:id`, `GET /countries/:id/states` |
| Cities | `GET/POST /cities`, `GET/PUT/PATCH /cities/:id`, `GET /states/:id/cities` |
| Industries | CRUD `/industries` |
| Recruitment Categories | CRUD `/recruitment-categories` |
| Roles | CRUD `/roles` (`industryId`, `categoryId` filters) |
| Qualifications | CRUD `/qualifications` |
| Experience Levels | CRUD `/experience-levels` |
| Salary Ranges | CRUD `/salary-ranges` |
| Source Categories | CRUD `/source-categories` |

Soft-deactivate via `PATCH /:resource/:id/status`.

---

## 5.2 Source & City Intelligence (Sprint 3–4)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/sources` | Filters: city, category, channelType, role, tags, rating |
| POST | `/sources` | Create + M2M links |
| GET | `/sources/:id` | Detail + performance summary |
| PUT/PATCH | `/sources/:id` | Update |
| GET | `/sources/:id/performance` | KPI history |
| POST | `/sources/:id/verify` | Set `last_verified` |
| GET | `/cities/:id/intelligence` | City intel profile |
| PUT | `/cities/:id/intelligence` | Update intel fields |
| GET | `/cities/compare` | Compare cities for a role |

---

## 5.3 Campaigns

| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/campaigns` | List / create (`recruiter_user_id` from JWT) |
| GET/PUT | `/campaigns/:id` | Detail / update |
| POST | `/campaigns/:id/sources` | Attach sources |
| DELETE | `/campaigns/:id/sources/:sourceId` | Detach |
| GET | `/campaigns/:id/checklist` | Action checklist |

---

## 5.4 Search & Recommendation (Sprint 5–6)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/search` | Structured search → Top 20 |
| GET | `/recommendations/:runId` | Prior run |
| POST | `/estimate` | Funnel estimates only |

### `POST /api/sourcing/search` body

```json
{
  "cityId": "uuid",
  "roleId": "uuid",
  "experienceLevelId": "uuid",
  "qualificationId": "uuid",
  "hiringCount": 50,
  "joiningTimelineDays": 5,
  "genderPreference": "ANY",
  "salaryMin": 20000,
  "salaryMax": 25000,
  "shift": "NIGHT",
  "languages": ["English"],
  "limit": 20
}
```

Each recommendation item: `sourceId`, `sourceName`, `priority`, `confidenceScore`, `expectedApplications`, `expectedInterviews`, `expectedJoinings`, `risk`, `reason`, plus rating/pool/responseRate.

---

## 5.5 Dashboard (Sprint 7)

| Method | Path |
|--------|------|
| GET | `/dashboard/summary` |
| GET | `/dashboard/charts/source-performance` |
| GET | `/dashboard/charts/city-distribution` |
| GET | `/dashboard/charts/role-distribution` |
| GET | `/dashboard/charts/campaign-performance` |

---

## 5.6 Copilot (Sprint 8)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/copilot/parse` | NL → structured intent (heuristic) |
| POST | `/copilot/plan` | Parse + recommend (+ optional content) |

---

## 5.7 Content (Sprint 9)

| Method | Path |
|--------|------|
| POST | `/content/generate` |

Returns Facebook, WhatsApp, LinkedIn, calling script, poster, invite, follow-up.

---

## 5.8 Learning (Sprint 10)

| Method | Path |
|--------|------|
| POST/GET | `/activities` |
| POST | `/learning/recompute/:sourceId` |
| GET | `/learning/scores/:sourceId` |

---

## 5.9 Supply / Demand

| Method | Path |
|--------|------|
| CRUD | `/market-companies` |
| CRUD | `/company-hirings` |
| CRUD | `/candidate-supplies` |

---

## 5.10 Error shape (align with ATS)

```json
{
  "error": "Validation Failed",
  "details": [{ "field": "hiringCount", "message": "must be >= 1" }]
}
```
