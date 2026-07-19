# 3. Modular Service Design (Node / Express)

**Version:** 2.0 — Modular monolith inside existing `server/`

## 3.1 Topology (v1)

```
┌────────────────────┐     ┌──────────────────────────────────┐
│  client-v2         │────▶│  server (Express)                │
│  + /sourcing pages │     │  ATS routes  +  sourcing routes  │
└────────────────────┘     └──────────────┬───────────────────┘
                                          │
                               ┌──────────▼──────────┐
                               │  PostgreSQL         │
                               │  schema: harmirecruit│
                               └─────────────────────┘
```

One deployable (existing Cloud Run service). Sourcing is a **module**, not a new microservice, until scale forces a split.

## 3.2 Internal modules

| Module path | Responsibility |
|-------------|----------------|
| `services/sourcing/masters/` | Geo + talent master CRUD |
| `services/sourcing/sources/` | Source + city intelligence |
| `services/sourcing/recommendation/` | Ranking engine (port + rule impl) |
| `services/sourcing/campaigns/` | Campaigns + campaign sources |
| `services/sourcing/content/` | Template content pack |
| `services/sourcing/conversation/` | NL → structured intent |
| `services/sourcing/learning/` | Activity → score updates |
| `services/sourcing/analytics/` | Dashboard aggregates |
| `repositories/sourcing/` | SQL only |

## 3.3 Mounting in Express

```ts
// server/src/index.ts (Sprint 2+)
import sourcingRouter from './routes/sourcing/index.js';
app.use('/api/sourcing', authMiddleware, tenantMiddleware, requireTenant, sourcingRouter);
```

Public surface stays versioned under `/api/sourcing/...` (see API list).

## 3.4 When to extract a microservice later

Extract `recommendation` + `learning` only if:

- CPU ranking becomes heavy, or
- LLM gateway needs isolated scaling / keys, or
- A second product consumes the same ranking API.

Until then: keep in-process ports.

## 3.5 Events (design now, implement later)

| Event | Producer | Consumer |
|-------|----------|----------|
| `SourcingActivityRecorded` | learning | analytics cache |
| `SourceScoreUpdated` | learning | recommendation (read path) |

v1: synchronous recompute inside `learningEngine.record()`.

## 3.6 Config

```env
SOURCING_RECOMMENDATION_PROVIDER=rule
SOURCING_CONTENT_PROVIDER=template
SOURCING_CONVERSATION_PROVIDER=heuristic
```

## 3.7 Compatibility with ATS

| Concern | Approach |
|---------|----------|
| Auth / tenant | Reuse middleware |
| Nav | Add “Sourcing” section in `client-v2` Layout |
| Deep link to Job | Optional `job_id` on campaign (Sprint 8+) |
| Messaging | Content templates only; send via existing WhatsApp later |
