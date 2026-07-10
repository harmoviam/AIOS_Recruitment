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

## WhatsApp integration (Meta Cloud API)

By default the inbox runs in **simulated** mode: messages are stored locally and nothing is sent to WhatsApp. **Settings → WhatsApp Integration** and the inbox header show the current server mode (`Live` vs `Simulated`).

### 1. Meta Business setup

1. Go to [developers.facebook.com](https://developers.facebook.com) → create or select an app → add the **WhatsApp** product.
2. Under **WhatsApp → API Setup**, note the **Phone number ID**.
3. Create a **System User** in Meta Business Settings with a permanent token that includes `whatsapp_business_messaging`.
4. Add a test recipient phone in API Setup (required while the app is in development mode).

### 2. Configure `.env`

Copy from `.env.example` and set:

```env
WHATSAPP_ENABLED=true
WHATSAPP_PHONE_NUMBER_ID=<from Meta API Setup>
WHATSAPP_ACCESS_TOKEN=<system user token>
WHATSAPP_VERIFY_TOKEN=<any random string you choose>
WHATSAPP_DEFAULT_COUNTRY_CODE=91
```

Restart the API after changing env vars (`npm run dev` or redeploy).

### 3. Webhook (required for inbound replies)

Meta must reach your server over **HTTPS**. For local development, use a tunnel (e.g. [ngrok](https://ngrok.com)):

```bash
ngrok http 3010
```

In Meta → WhatsApp → Configuration → Webhook:

| Field | Value |
|--------|--------|
| **Callback URL** | `https://<your-public-host>/api/whatsapp/webhook` |
| **Verify token** | Same string as `WHATSAPP_VERIFY_TOKEN` in `.env` |
| **Subscribe to** | `messages` |

Click **Verify and save**. The app responds to Meta’s `hub.challenge` handshake on `GET /api/whatsapp/webhook`.

### 4. Verify in the app

1. Open **Settings → WhatsApp Integration** — banner should show **Live (Meta API)** when env is correct.
2. Open **Messages**, pick a candidate with a phone number on file, send a test message — bubble should show **Delivered to WhatsApp** (or an error if Meta rejected it).
3. Reply from the candidate’s phone — message should appear in the thread (refresh the thread if needed).

### 5. Important limits

- **24-hour window:** Free-text messages (`sendWhatsAppText`) only work within 24 hours of the candidate’s last WhatsApp message. Outside that window you need Meta **approved templates** (not yet wired for automated follow-ups).
- **Candidate phone:** Must match the number on the candidate profile (last 10 digits are used for inbound matching).
- **Workspace branding** in Settings (business name / display phone) is for recruiter signatures only — it does not connect the Meta account.

## Cloud deployment (GCP)

Deploys to **Cloud Run** on the shared `harmoviajobs` GCP project, reusing the existing Cloud SQL instance with schema `harmirecruit`. See [DEPLOYMENT.md](./DEPLOYMENT.md) for setup, cost breakdown, and CI/CD.
