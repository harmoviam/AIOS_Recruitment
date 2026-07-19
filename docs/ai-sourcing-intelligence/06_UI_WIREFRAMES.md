# 6. UI Wireframes (client-v2)

**Version:** 2.0 — Extend existing React app; reuse TopBar, PageHeader, cards, tables, CSS variables. Dark-mode ready via existing theme tokens.

Nav addition: **Sourcing** group → Copilot · Search · Dashboard · Sources · Campaigns · Masters (admin).

---

## 6.1 Recruiter Search (Sprint 5)

```
┌─ Find Best Sources ──────────────────────────────────────────┐
│ City* [Mohali ▼]     Role* [Intl Voice Process ▼]            │
│ Experience [Fresher ▼]  Qualification [Any ▼]                │
│ Hiring Count [50]    Joining Timeline (days) [5]             │
│ Gender [Any ▼]       Salary [20000]–[25000]                  │
│ Shift [Night ▼]      Language [English ▼]                    │
│              [ Find Best Sources ]                           │
└──────────────────────────────────────────────────────────────┘
```

## 6.2 Recommendation Results (Sprint 6)

```
┌─ Sourcing Plan — Mohali · Intl Voice · 50 hires ─────────────┐
│ Est. Apps 420 │ Interviews 126 │ Joinings 38 │ Risk MED      │
├──────────────────────────────────────────────────────────────┤
│ P1 | Mohali Voice FB Group | Conf 0.86 | Apps 120 | …        │
│ P2 | … Top 20 …                                              │
│ Reason panel for selected row                                │
│ [ Create Campaign ] [ Generate Content ] [ Export ]          │
│ Map placeholder                                              │
└──────────────────────────────────────────────────────────────┘
```

## 6.3 Dashboard (Sprint 7)

KPI cards + charts (reuse AnalyticsPage / Recharts patterns): Source Performance, City Distribution, Role Distribution, Campaign Performance.

## 6.4 Copilot (Sprint 8)

Single-turn intent UI (not a chat product):

```
Recruiter: Need 50 International Voice Process in Mohali.
Agent:     Role / City / Count / Experience (confirm)
           [ Confirm & Generate Plan ] → Results (6.2)
```

## 6.5 Content Studio (Sprint 9)

Tabs: Facebook | WhatsApp | LinkedIn | Script | Poster | Invite | Follow-up — editable, copy, attach to campaign.

## 6.6 Design notes

- Follow existing `app.css` patterns (no new design system in Sprint 1–6)
- Tables first; cards for KPI summaries and plan actions only
- Responsive: filters stack; tables → compact lists on small screens
