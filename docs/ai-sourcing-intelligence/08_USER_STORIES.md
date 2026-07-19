# 9. User Stories (Node / Express)

**Version:** 2.0  

Format: As a… I want… So that…  
Priority: P0 must-have for MVP, P1 important, P2 later.

---

## Epic A — Master Data

| ID | Story | Priority | Sprint |
|----|-------|----------|--------|
| US-A01 | As an Admin, I want to manage Countries/States/Cities so that sources and searches are geo-accurate | P0 | S2 |
| US-A02 | As an Admin, I want to manage Roles/Industries/Experience/Qualifications so that demand can be structured | P0 | S3 |
| US-A03 | As an Admin, I want to manage Source Categories so that channels are classified consistently | P0 | S3 |

## Epic B — Source & City Intelligence

| ID | Story | Priority | Sprint |
|----|-------|----------|--------|
| US-B01 | As a Sourcer, I want to register a Facebook/WhatsApp/College source with quality metrics so that it can be recommended | P0 | S3–S4 |
| US-B02 | As a Recruitment Manager, I want city intelligence (colleges, BPO density, night shift acceptance) so that I can judge market fit | P0 | S4 |
| US-B03 | As an Admin, I want to mark a source last-verified so that stale channels are deprioritized | P1 | S4 |

## Epic C — Sourcing Search & Recommendations

| ID | Story | Priority | Sprint |
|----|-------|----------|--------|
| US-C01 | As a Recruiter, I want to enter city/role/count/timeline/salary/shift/language and get Top 20 sources so that I know where to hire | P0 | S5–S6 |
| US-C02 | As a Recruiter, I want confidence, expected apps/interviews/joinings, risk, and reason per source so that I can justify the plan | P0 | S6 |
| US-C03 | As a Manager, I want funnel estimates for the whole plan so that I can forecast hiring | P0 | S6 |

## Epic D — Copilot

| ID | Story | Priority | Sprint |
|----|-------|----------|--------|
| US-D01 | As a Recruiter, I want to type a natural language hiring need and see a structured confirmation so that I don’t fill a long form | P0 | S8 |
| US-D02 | As a Recruiter, I want one click from confirmed intent to the sourcing plan dashboard so that I move fast | P0 | S8 |

## Epic E — Campaigns & Content

| ID | Story | Priority | Sprint |
|----|-------|----------|--------|
| US-E01 | As a Recruiter, I want to create a campaign from Top N sources so that execution is tracked | P0 | S3/S6 |
| US-E02 | As a Recruiter, I want Facebook/WhatsApp/LinkedIn/script/invite templates so that I can post today | P0 | S9 |
| US-E03 | As a Recruiter, I want an action checklist so that I don’t miss follow-ups | P1 | S6/S9 |

## Epic F — Dashboard & Learning

| ID | Story | Priority | Sprint |
|----|-------|----------|--------|
| US-F01 | As a Manager, I want KPI cards and charts for sources/cities/campaigns so that I can coach the team | P0 | S7 |
| US-F02 | As a Recruiter, I want to log applications/interviews/offers/joinings/no-shows/drops against a source so that the system learns | P0 | S10 |
| US-F03 | As a Manager, I want source scores to update from outcomes so that future recommendations improve | P0 | S10 |

## Epic G — Platform Quality

| ID | Story | Priority | Sprint |
|----|-------|----------|--------|
| US-G01 | As a Developer, I want TypeScript ports + provider factory (`SOURCING_*_PROVIDER`) so LLMs can replace rules later without rewriting use-cases | P0 | S1/S6 |
| US-G04 | As a Developer, I want sourcing to reuse existing JWT/tenant middleware so recruiters do not maintain a second login | P0 | S1/S2 |
| US-G02 | As a Security Officer, I want RBAC so that viewers cannot mutate masters | P0 | S2 |
| US-G03 | As a QA Engineer, I want pagination/filter/sort on all lists so that large datasets remain usable | P0 | S2+ |

---

## Acceptance Example — US-C01 (Mohali Voice)

**Given** Mohali city and International Voice Process role exist with seeded sources  
**When** Recruiter submits hiringCount=50, experience=Fresher, salary=25000, joiningTimelineDays=5  
**Then** API returns ≤20 ranked sources each with confidence, funnel estimates, risk, priority, reason  
**And** No external LLM is called
