# 10. Sequence Diagrams (Node / Express)

**Version:** 2.0

## 10.1 Structured Search → Recommendations

```mermaid
sequenceDiagram
    actor R as Recruiter
    participant UI as client-v2 SearchPage
    participant API as routes/sourcing/search
    participant UC as sourcingSearchUseCase
    participant Rec as RecommendationService
    participant Repo as sourceRepository
    participant Perf as performanceRepository
    participant DB as PostgreSQL

    R->>UI: Submit search form
    UI->>API: POST /api/sourcing/search (JWT + tenant)
    API->>UC: execute(criteria, tenantId, userId)
    UC->>Rec: recommend(criteria)
    Rec->>Repo: findCandidates(tenant, city, role, filters)
    Repo->>DB: SELECT source + joins
    DB-->>Repo: rows
    Rec->>Perf: loadScores(sourceIds, city, role)
    Perf->>DB: SELECT source_performance
    DB-->>Perf: KPIs
    Rec->>Rec: score, rank, funnel, risk, reason
    Rec-->>UC: RecommendationResult
    UC->>DB: INSERT recommendation_run
    UC-->>API: result + runId
    API-->>UI: Top 20 + plan summary
    UI-->>R: Results dashboard
```

## 10.2 Copilot NL → Plan

```mermaid
sequenceDiagram
    actor R as Recruiter
    participant UI as CopilotPage
    participant API as routes/sourcing/copilot
    participant Conv as ConversationService
    participant UC as sourcingSearchUseCase

    R->>UI: "Need 50 Voice Process candidates in Mohali"
    UI->>API: POST /api/sourcing/copilot/parse
    API->>Conv: parse(text)
    Conv->>Conv: heuristic extract
    Conv-->>API: StructuredIntent
    API-->>UI: Confirm fields
    R->>UI: Confirm & Generate Plan
    UI->>API: POST /api/sourcing/copilot/plan
    API->>UC: execute(intent→criteria)
    UC-->>API: RecommendationResult
    API-->>UI: Plan dashboard payload
```

## 10.3 Learning Loop

```mermaid
sequenceDiagram
    actor R as Recruiter
    participant UI as Activity form
    participant API as routes/sourcing/activities
    participant Learn as learningEngineService
    participant DB as PostgreSQL

    R->>UI: Log apps / interviews / offers / joinings / no-shows / drops
    UI->>API: POST /api/sourcing/activities
    API->>Learn: record(activity, tenantId)
    Learn->>DB: INSERT sourcing_recruiter_activity
    Learn->>Learn: recompute success_score
    Learn->>DB: UPSERT source_performance
    Note over Learn: Next recommend() reads updated past_success_rate
```

## 10.4 Content Generation

```mermaid
sequenceDiagram
    actor R as Recruiter
    participant UI as ContentStudioPage
    participant API as routes/sourcing/content
    participant Cgen as ContentGeneratorService
    participant Tpl as templates/

    R->>UI: Generate content
    UI->>API: POST /api/sourcing/content/generate
    API->>Cgen: generate(request)
    Cgen->>Tpl: load FB/WA/LI/script templates
    Cgen->>Cgen: merge tokens
    Cgen-->>API: ContentPack
    API-->>UI: Editable tabs
```

## 10.5 Future LLM Swap

```mermaid
sequenceDiagram
    participant UC as UseCase
    participant Factory as providers.ts
    participant Rule as ruleBasedRecommendationService
    participant LLM as llmRecommendationService

    UC->>Factory: getRecommendationService()
    alt SOURCING_RECOMMENDATION_PROVIDER=rule
        Factory-->>UC: Rule impl
        UC->>Rule: recommend()
    else SOURCING_RECOMMENDATION_PROVIDER=llm
        Factory-->>UC: LLM impl
        UC->>LLM: recommend()
    end
```
