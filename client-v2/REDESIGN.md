# UI v2 — Redesign preview (`client-v2/`)

A complete visual redesign of the AIOS Recruitment frontend, built as a **parallel client** so the
existing app in `client/` is untouched. Same features, same API, same auth — new look and a fully
mobile-friendly, responsive experience end to end.

## How to review

```bash
npm install --prefix client-v2     # first time only

# Option A: v2 only (server + new UI)
npm run dev:v2                     # → http://localhost:5174

# Option B: side-by-side comparison (server + old UI + new UI)
npm run dev:both                   # old → :5173, new → :5174
```

Log in with the same demo accounts (e.g. `admin@aios.com` / `password123`, workspace `staffpro-agency`).

To test mobile, open DevTools → device toolbar (⌘⇧M) and pick a phone, or open
`http://<your-mac-ip>:5174` from a real phone on the same network (add `--host` to the vite dev
script if needed).

## What changed

**Design system** (`src/styles/app.css`, fully rewritten)
- Dark navy app chrome (sidebar, mobile header, bottom bar) against a light, airy content area.
- Tenant branding preserved: every accent color derives from the tenant's primary color at runtime.
- New typography scale, softer shadows, larger touch targets (40px+), focus rings, reduced-motion support.

**Responsive shell** (`src/components/Layout.tsx`, rebuilt)
- Desktop (≥1024px): collapsible icon sidebar with SVG icons per section.
- Mobile (<1024px): sticky top header (menu · workspace · profile), slide-in navigation drawer,
  and a bottom tab bar (Home / Pipeline / Candidates / Inbox / More) with safe-area support.
  Platform admins get platform-specific tabs.

**Mobile patterns across every page**
- Tables scroll horizontally inside their cards instead of breaking the layout.
- Kanban pipeline swipes column-by-column with scroll-snap.
- WhatsApp inbox becomes a master–detail flow: conversation list → chat with a back button,
  AI reply suggestions become a horizontal chip strip above the input.
- Login, settings, plans, forms, calendar, and KPI grids all reflow to single column.

**Untouched (shared with v1)**
- All business logic, API client, auth/tenant contexts, routing, and page behavior.
- The backend — v2 proxies `/api` to the same Express server.

## Promoting v2 later

If you approve the redesign, it can either replace `client/` wholesale, or the changed files
(`styles/app.css`, `components/Layout.tsx`, `pages/MessagesPage.tsx`, `index.html`) can be copied
back into `client/` — nothing else diverges.
