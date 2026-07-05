# Phase 1 — Implemented Features

Phase 1 delivers the full enterprise UI (18 screens) wired to a multi-tenant PostgreSQL backend.

## Run

```bash
npm run db:init   # migrate + seed (harmirecruit schema)
npm run dev       # client :5173 + API :3003
```

## Demo Accounts

| Workspace | Email | Password |
|-----------|-------|----------|
| `staffpro-agency` | admin@aios.com | password123 |
| `staffpro-agency` | priya@aios.com | password123 |
| `talentbridge` | admin@talentbridge.com | password123 |
| `platform` | super@aios.com | password123 |

## Backend API (tenant-scoped)

| Module | Endpoints |
|--------|-----------|
| Auth | login, register, me, PATCH me, forgot/reset password |
| Candidates | CRUD, suggestions, timeline, bulk update, CSV export, import validate/import |
| Follow-ups | list, counts, create, update, delete |
| Companies | CRUD |
| Hiring Managers | list, create, update |
| Recruiters | stats, HM dashboard |
| Reports | recruiter/funnel/offer reports + CSV export |
| Jobs, Interviews, Messages, Activities, Analytics, Settings, Tenant, Platform | (existing) |

## Frontend Screens (wired to API)

- Login, Forgot Password (with dev reset link)
- Role dashboards: Admin, Recruiter, Hiring Manager
- Candidates: list (bulk actions + export), add, import CSV, 360° detail (tabs)
- Follow-up Center, Pipeline, Jobs, Interviews, Messages
- People: Recruiters, Hiring Managers, Companies
- Reports, Analytics
- Settings, Profile, Organization, Billing (UI), Platform admin

## Multi-Tenancy

- `X-Tenant-Slug` header + JWT `tenant_id`
- Row-level isolation on all scoped tables
- Cross-tenant access returns 403

## Not in Phase 1

- OAuth / SSO
- Real email delivery for password reset (dev mode returns reset URL)
- AI calling, automation workflows (Phase 2+)
