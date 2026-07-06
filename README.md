# AIOS Recruitment

Full-stack recruitment platform with React + TypeScript frontend and Express + PostgreSQL backend.

## Stack

- **Frontend:** React 19, TypeScript, Vite, React Router, @dnd-kit, Recharts
- **Backend:** Express, PostgreSQL, JWT auth, bcrypt

## Quick start

### 1. PostgreSQL

Uses database **`harmoviajobs_courses_db`** with schema **`harmirecruit`** (tables are isolated from other apps in the same database).

Ensure PostgreSQL is running and the database exists:
```bash
psql -U postgres -c "CREATE DATABASE harmoviajobs_courses_db;" 2>/dev/null || true
```

Configure `.env` (see `.env.example`):
```
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/harmoviajobs_courses_db
DB_SCHEMA=harmirecruit
```

### 2. Environment

```bash
cp .env.example .env
```

### 3. Install & init

```bash
npm run setup
npm run db:init
```

### 4. Run

```bash
npm run dev
```

- **Frontend:** http://localhost:5174
- **API:** http://localhost:3010

### Demo login

**StaffPro workspace:** `staffpro-agency`
- Email: `admin@aios.com` / `password123`

**TalentBridge workspace:** `talentbridge`
- Email: `admin@talentbridge.com` / `password123`

**Platform super admin:** workspace `platform`
- Email: `super@aios.com` / `password123`

Each workspace has isolated candidates, jobs, settings, and users. API requests include `X-Tenant-Slug` header.

## Features

| Module | Functionality |
|--------|---------------|
| **SaaS Multi-Tenancy** | Workspace slugs, org switcher, tenant branding, plan tiers (Starter/Pro/Enterprise), platform admin |
| **Auth** | Login, register, JWT sessions, workspace-scoped login |
| **Dashboard** | KPIs, activity feed, AI recommendations |
| **Pipeline** | Kanban drag-and-drop, stage updates, search/filter by job |
| **Candidates** | Profile, notes, interview history, AI insights |
| **Jobs** | CRUD job openings, match %, pipeline counts |
| **WhatsApp Inbox** | Conversations, send messages, AI reply suggestions |
| **Interviews** | Schedule, confirm, meeting links |
| **Analytics** | Charts for funnel, recruiters, sources, trends |
| **Settings** | Team management, WhatsApp & branding config |

## Project structure

```
├── client-v2/       React app
├── server/          Express API
├── wireframes/      Original design mockups (reference)
└── docker-compose.yml
```

## Production build

```bash
npm run build
NODE_ENV=production npm start
```

Serves the built React app from Express on port 3010.

## Cloud deployment (GCP)

Deploys to **Cloud Run** on the shared `harmoviajobs` GCP project, reusing the existing Cloud SQL instance with schema `harmirecruit`. See [DEPLOYMENT.md](./DEPLOYMENT.md) for setup, cost breakdown, and CI/CD.
