# 4. Folder Structure (Node / Express)

**Version:** 2.0 — Extends existing monorepo

```
AIOS_Recruitment/
├── server/
│   └── src/
│       ├── index.ts                          # mount /api/sourcing
│       ├── db.ts                             # + migrateSourcingIntelligence()
│       ├── middleware/                       # reuse auth, tenant, asyncHandler
│       ├── routes/
│       │   └── sourcing/
│       │       ├── index.ts                  # router aggregator
│       │       ├── countries.ts
│       │       ├── states.ts
│       │       ├── cities.ts
│       │       ├── roles.ts
│       │       ├── industries.ts
│       │       ├── sources.ts
│       │       ├── campaigns.ts
│       │       ├── search.ts                 # POST /search, /estimate
│       │       ├── copilot.ts
│       │       ├── content.ts
│       │       ├── activities.ts
│       │       └── dashboard.ts
│       ├── dto/sourcing/
│       │   ├── search.ts
│       │   ├── recommendation.ts
│       │   └── ...
│       ├── repositories/sourcing/
│       │   ├── cityRepository.ts
│       │   ├── sourceRepository.ts
│       │   ├── performanceRepository.ts
│       │   └── ...
│       └── services/sourcing/
│           ├── ports.ts                      # interfaces
│           ├── providers.ts                  # factory from env
│           ├── masters/
│           ├── recommendation/
│           │   ├── ruleBasedRecommendationService.ts
│           │   └── scoringPolicy.ts
│           ├── conversation/
│           │   └── heuristicConversationService.ts
│           ├── content/
│           │   ├── templateContentGeneratorService.ts
│           │   └── templates/                # .ts or .md templates
│           ├── learning/
│           │   └── learningEngineService.ts
│           └── analytics/
│               └── dashboardAnalyticsService.ts
│
├── client-v2/
│   └── src/
│       ├── api/client.ts                     # + sourcing API methods
│       ├── types/sourcing.ts                 # NEW
│       ├── pages/sourcing/
│       │   ├── CopilotPage.tsx
│       │   ├── SearchPage.tsx
│       │   ├── ResultsPage.tsx
│       │   ├── DashboardPage.tsx
│       │   ├── SourcesPage.tsx
│       │   ├── SourceDetailPage.tsx
│       │   ├── CampaignsPage.tsx
│       │   ├── ContentStudioPage.tsx
│       │   └── masters/                      # admin CRUD screens
│       └── components/sourcing/              # shared sourcing UI
│
├── scripts/
│   └── migrate-sourcing-intelligence.sql     # prod mirror of db.ts migrate
│
└── docs/ai-sourcing-intelligence/            # this plan
```

## Dependency rule

```
routes/sourcing → services/sourcing → repositories/sourcing → pg
routes must not embed ranking SQL
services must depend on ports.ts interfaces for AI-swappable pieces
```

Enforced by code review in S1–S6; optional ESLint `no-restricted-imports` later.
