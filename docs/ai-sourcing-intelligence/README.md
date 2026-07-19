# HarmiRecruit — AI Sourcing Intelligence Agent

**Status:** Sprints 1–11 implemented (Node/Express modular delivery) — ready for UAT  
**Product Codename:** HarmiRecruit Sourcing Copilot  
**Document Set Version:** 2.0 (Node / Express)  
**Date:** 19 July 2026  
**Stack:** **Node.js + Express + TypeScript** (extends existing monorepo)

---

## What This Is

An enterprise **Recruiter Copilot** (not a chatbot) that behaves like a Recruitment Manager with 20+ years of experience.

When a recruiter says:

> “I need 50 International Voice Process candidates in Mohali.”

the system produces a **sourcing strategy**: ranked channels, funnel estimates, campaign plan, content templates, and an action checklist — then learns from outcomes.

---

## Document Index

| # | Deliverable | File |
|---|-------------|------|
| 1 | Complete Product Architecture | [01_PRODUCT_ARCHITECTURE.md](./01_PRODUCT_ARCHITECTURE.md) |
| 2 | Database ER Diagram | [02_DATABASE_ER.md](./02_DATABASE_ER.md) |
| 3 | Modular Service Design | [03_MICROSERVICE_DESIGN.md](./03_MICROSERVICE_DESIGN.md) |
| 4 | Folder Structure | [04_FOLDER_STRUCTURE.md](./04_FOLDER_STRUCTURE.md) |
| 5 | API List | [05_API_LIST.md](./05_API_LIST.md) |
| 6 | UI Wireframes | [06_UI_WIREFRAMES.md](./06_UI_WIREFRAMES.md) |
| 7 | Development Sprint Plan | [07_SPRINT_PLAN.md](./07_SPRINT_PLAN.md) |
| 8 | Database Scripts | [sql/V1__sourcing_intelligence_schema.sql](./sql/V1__sourcing_intelligence_schema.sql) |
| 9 | User Stories | [08_USER_STORIES.md](./08_USER_STORIES.md) |
| 10 | Sequence Diagrams | [09_SEQUENCE_DIAGRAMS.md](./09_SEQUENCE_DIAGRAMS.md) |

**Interactive overview:**  
[harmirecruit-sourcing-architecture.canvas.tsx](/Users/apple/.cursor/projects/Users-jyotiranjan-workarea-projects-AIOS-Recruitment/canvases/harmirecruit-sourcing-architecture.canvas.tsx)

---

## Stack (revised)

| Layer | Choice |
|-------|--------|
| Backend | **Node.js + Express + TypeScript** (`server/`) |
| DB access | `pg` pool + SQL (same as ATS) |
| Migrations | `migrateSourcingIntelligence()` in `server/src/db.ts` + mirrored `scripts/migrate-sourcing-intelligence.sql` |
| Auth | Existing JWT + `authMiddleware` + `tenantMiddleware` + RBAC |
| Frontend | **Extend `client-v2/`** (existing design system; dark-mode ready CSS vars) |
| Charts | Recharts (already in client) or Apache ECharts if preferred in Sprint 7 |
| AI (v1) | Rule / template / heuristic — **no OpenAI/Claude for sourcing yet** |

---

## Relationship to Existing Repo

| Existing ATS | Sourcing Copilot (this module) |
|--------------|--------------------------------|
| Candidate pipeline, jobs, interviews, WhatsApp | Channel intelligence, recommendations, campaigns, learning |
| `server/` Express routes + services | New `routes/sourcing/*` + `services/sourcing/*` |
| `client-v2/` pages | New pages under sourcing nav section |
| `users` / tenants / JWT | **Reuse** — no separate recruiter auth table |
| `companies` (client accounts) | Separate `sourcing_market_company` (BPO/IT landscape) |
| `activities` (ATS feed) | Separate `sourcing_recruiter_activity` (learning outcomes) |

**Integration approach (v2.0):**

```
AIOS_Recruitment/
├── server/src/
│   ├── routes/sourcing/          # NEW
│   ├── services/sourcing/        # NEW (ports + rule engine)
│   ├── dto/sourcing/             # NEW
│   └── db.ts                     # + migrateSourcingIntelligence()
├── client-v2/src/pages/sourcing/ # NEW
├── scripts/migrate-sourcing-intelligence.sql
└── docs/ai-sourcing-intelligence/
```

Same process, same Postgres schema (`harmirecruit`), same Cloud Run deploy path.

---

## Approval Gate

Sprints 1–11 are implemented end-to-end. Reply with:

1. **`UAT notes: …`** — bugs / polish requests  
2. **`REVISE: …`** — design changes  
3. Optional next: LLM providers behind existing ports
