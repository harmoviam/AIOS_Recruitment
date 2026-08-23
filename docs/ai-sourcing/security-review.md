# AI Sourcing Agent — Security Review (Sprint 1)

**Date:** 2026-08-08  
**Scope:** New `/api/ai-sourcing` module + `/ai-sourcing` UI against existing auth/tenant model.

---

## Threat model (Sprint 1)

| Threat | Mitigation |
|--------|------------|
| Cross-tenant search leakage | All queries filter `tenant_id`; middleware `requireTenant`; search rows keyed by `tenant_id` |
| Recruiter sees other recruiters’ candidates | Reuse `candidateScopeSql` / HM team rules from `accessScope.ts` |
| Module enabled in unwanted envs | `AI_SOURCING_ENABLED=false` → `403 AI_SOURCING_DISABLED` |
| Unauthenticated access | `authMiddleware` on secured router |
| Super-admin spoofing tenant | Existing tenant middleware ignores slug for non–super-admin |
| Prompt / NL injection into SQL | Parameterized SQL only; criteria validated with Zod; no string-concat filters |
| Oversized payloads | Zod max lengths on query; limit/offset caps |
| LLM data exfiltration | Parser sends only recruiter query text (truncated); no bulk candidate dump to LLM in Sprint 1 |
| Secrets in repo | No new secrets committed; reuse `AI_*` env; never overwrite `.env` |

---

## AuthN / AuthZ

1. JWT required for parse/search/recent.
2. Role gate: `AI_SOURCING_VIEW` / `AI_SOURCING_SEARCH` mapped to org roles that already access candidates.
3. GET-by-id checks `tenant_id` match (and optionally owning `user_id` for non-admins — Sprint 1: any tenant member with VIEW may read searches in-tenant created by self; admins see tenant-wide recent).
4. Plan write locks (`requireTenant` subscription) apply via existing middleware stack.

---

## Data handling

- `result_preview` stores a **minimal** candidate projection (id, name, contact, skills, stage, scores) — avoid storing full `resume_text` in search rows.
- No PII sent to external people APIs in this module (PDL remains under `/api/sourcing`).
- Logs: avoid logging full candidate lists; parser may log mode + query length.

---

## Frontend

- Route behind `PrivateRoute` + `OrgWorkspaceRoute`.
- UI gating is convenience-only; API enforces access.
- Feature flag is server-authoritative; client should handle 403 gracefully.

---

## Residual risks / follow-ups

| Item | Severity | Notes |
|------|----------|-------|
| No fine-grained permission table | Low | Documented; role mapping only |
| Search preview staleness | Low | Snapshot may diverge from live candidate |
| LLM prompt injection | Medium | Heuristic fallback; constrain schema; truncate input |
| Missing rate limit on search | Medium | Add express-rate-limit in Sprint 2 (pattern exists on PDL people) |
| Audit trail | Low | `ai_sourcing_searches` acts as basic audit; expand later |

---

## Checklist before production enablement

- [ ] `AI_SOURCING_ENABLED` explicit in prod env
- [ ] Confirm JWT_SECRET not default
- [ ] Confirm AI provider endpoint is trusted / no candidate bulk prompts
- [ ] Smoke-test recruiter vs admin scoping
- [ ] Ensure migrations applied via `db:init` / deploy path
