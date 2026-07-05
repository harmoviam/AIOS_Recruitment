# AIOS Recruitment — Multi-Tenant SaaS Architecture

**Model:** B2B SaaS for recruitment agencies & staffing firms  
**Tenancy:** Single database, shared schema, `tenant_id` row-level isolation  
**Access:** Subdomain (`acme.aios.app`) or workspace slug (`aios.app/acme`)

---

## 1. Tenant Hierarchy

```
AIOS Platform (Super Admin)
│
├── Tenant: StaffPro Agency          [Pro Plan]
│   ├── Tenant Admin
│   ├── Recruiters
│   ├── Hiring Managers (client portal)
│   └── Data: candidates, jobs, companies, messages…
│
├── Tenant: TalentBridge Solutions   [Enterprise]
│   └── …
│
└── Tenant: QuickHire Staffing       [Starter]
    └── …
```

| Role | Scope | Can switch tenants? |
|------|-------|---------------------|
| `super_admin` | Entire platform | Yes — all tenants |
| `admin` | Single tenant (org admin) | No |
| `recruiter` | Single tenant | No |
| `hiring_manager` | Single tenant (limited) | No |

---

## 2. Data Isolation Rules

Every tenant-scoped table includes `tenant_id`:

- users, candidates, jobs, companies, interviews, messages, activities, settings, follow_ups, templates

**Query rule:** All reads/writes filter by `tenant_id` from JWT or session context.

**Super admin:** Bypass with explicit tenant context header (`X-Tenant-Slug`) when impersonating.

---

## 3. Tenant Onboarding Flow

```
Sign up (workspace slug + org name)
  → Create tenant record
  → Seed default pipeline stages, roles, templates
  → Invite first admin
  → 14-day trial (Starter features)
  → Upgrade / billing
```

**Workspace slug rules:** lowercase, 3–32 chars, `[a-z0-9-]`, unique globally.

---

## 4. Plans & Feature Gates

| Feature | Starter | Pro | Enterprise |
|---------|---------|-----|------------|
| Recruiters | 3 | 15 | Unlimited |
| Candidates | 2,000 | 25,000 | Unlimited |
| WhatsApp | ✓ | ✓ | ✓ |
| AI Calling | — | ✓ | ✓ |
| Automation | Basic | Full | Full + custom |
| White-label | — | Logo | Full branding |
| API access | — | — | ✓ |
| SSO | — | — | ✓ |

Feature flags stored on `tenants.features` JSON; UI gates via `useTenant().can('ai_calling')`.

---

## 5. URL & Routing Strategy

| Pattern | Example | Use |
|---------|---------|-----|
| Subdomain | `staffpro.aios.app/dashboard` | Production default |
| Path-based | `app.aios.com/t/staffpro/dashboard` | Fallback / dev |
| Platform admin | `app.aios.com/platform/tenants` | Super admin only |

**Frontend:** `TenantProvider` resolves tenant from subdomain, path, or localStorage slug.

---

## 6. Branding Per Tenant

Each tenant can configure:

- Logo, favicon, primary color
- Email/WhatsApp sender name
- Custom domain (Enterprise)

Applied via CSS variables: `--tenant-primary`, `--tenant-logo`.

---

## 7. Screens Added for SaaS

| Screen | Persona | Route |
|--------|---------|-------|
| Workspace login | All | `/login` (+ workspace field) |
| Org switcher | Super admin | TopBar dropdown |
| Platform dashboard | Super admin | `/platform` |
| Tenant management | Super admin | `/platform/tenants` |
| Tenant detail | Super admin | `/platform/tenants/:slug` |
| Org settings | Tenant admin | `/settings/organization` |
| Billing & plan | Tenant admin | `/settings/billing` |

---

## 8. API Contract (Future Backend)

```
Headers:
  Authorization: Bearer <jwt>
  X-Tenant-Slug: staffpro-agency   (required for tenant-scoped routes)

JWT claims:
  sub, email, role, tenant_id, tenant_slug
```

Super admin JWT may omit `tenant_id`; must send `X-Tenant-Slug` when acting in tenant context.

---

## 9. Security Checklist

- [ ] Row-level security or middleware tenant filter on every query
- [ ] Tenant slug validated on login — user must belong to tenant
- [ ] Cross-tenant ID enumeration blocked (404 not 403)
- [ ] Audit log includes tenant_id
- [ ] File uploads namespaced by tenant
- [ ] Rate limits per tenant plan

---

## 10. Backend Implementation Status

Implemented in `server/`:

| Component | File |
|-----------|------|
| `tenants` table + migration | `src/db.ts` |
| Tenant middleware | `src/middleware/tenant.ts` |
| JWT with `tenant_id` | `src/middleware/auth.ts` |
| Workspace-scoped login | `src/routes/auth.ts` |
| Platform admin API | `src/routes/platform.ts` |
| Current tenant API | `src/routes/tenant.ts` |
| Scoped queries (all modules) | `src/routes/*.ts` |

**Headers:** `Authorization: Bearer <jwt>` + `X-Tenant-Slug: <slug>`

**Run migration:** `npm run db:init`

---
