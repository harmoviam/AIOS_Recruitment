# HarmiRecruit — Google Cloud Deployment

Deploy AIOS Recruitment on **`aiosrecruitment`**, connecting cross-project to Cloud SQL in **`harmoviajobs`**. No new database server — only schema `harmirecruit` on the existing instance.

## Architecture (cross-project, cost-optimized)

```
┌──────────────────────────────┐     ┌──────────────────────────────┐
│  aiosrecruitment             │     │  harmoviajobs                │
│                              │     │                              │
│  Cloud Run: harmirecruit     │────▶│  Cloud SQL: harmoviajobs-db  │
│  Artifact Registry           │     │  DB: harmoviajobs_courses_db │
│  Secret Manager              │     │    └── schema: harmirecruit  │
│  min-instances: 0            │     │                              │
└──────────────────────────────┘     └──────────────────────────────┘
         same Google account — IAM grants cross-project Cloud SQL access
```

## Why this is cost-effective

| Resource | Project | Cost |
|----------|---------|------|
| **Cloud SQL** | `harmoviajobs` (shared) | No new DB bill (~$25–50/mo saved) |
| **Cloud Run** | `aiosrecruitment` | Scales to zero when idle (~$0) |
| **Artifact Registry** | `aiosrecruitment` | Minimal storage |

## Configuration

| Setting | Value |
|---------|-------|
| App GCP Project | `aiosrecruitment` |
| DB GCP Project | `harmoviajobs` |
| Region | `us-central1` |
| Cloud SQL | `harmoviajobs:us-central1:harmoviajobs-db-us1` |
| Cloud Run service | `harmirecruit` |
| Artifact Registry | `us-central1-docker.pkg.dev/aiosrecruitment/platform-repo` |
| Service account | `cloud-run-harmirecruit-sa@aiosrecruitment.iam.gserviceaccount.com` |

## Database connection

```bash
DATABASE_URL=postgresql://app_user:Harmovia123@/harmoviajobs_courses_db?host=/cloudsql/harmoviajobs:us-central1:harmoviajobs-db-us1&schema=harmirecruit
```

Schema is embedded in the URL (`&schema=harmirecruit`). Stored in Secret Manager (`aiosrecruitment`) as `harmirecruit-db-url`.

## One-time setup

```bash
gcloud auth login
gcloud config set project aiosrecruitment

chmod +x scripts/gcp-setup.sh
AUTO_DEPLOY=1 ./scripts/gcp-setup.sh   # setup + build + deploy
```

The script:
1. Enables APIs on `aiosrecruitment`
2. Creates Artifact Registry, service account, secrets
3. Grants `roles/cloudsql.client` on **`harmoviajobs`** to the app service account
4. Optionally builds and deploys Cloud Run

### Initialize database schema

```bash
cloud-sql-proxy harmoviajobs:us-central1:harmoviajobs-db-us1 &

DATABASE_URL="postgresql://app_user:Harmovia123@127.0.0.1:5432/harmoviajobs_courses_db?schema=harmirecruit" \
npm run db:init
```

## Manual deploy

```bash
gcloud builds submit --config=cloudbuild.yaml --project=aiosrecruitment

gcloud run deploy harmirecruit \
  --image us-central1-docker.pkg.dev/aiosrecruitment/platform-repo/harmirecruit:latest \
  --region us-central1 \
  --project aiosrecruitment \
  --add-cloudsql-instances harmoviajobs:us-central1:harmoviajobs-db-us1
```

## CI/CD (GitHub Actions)

Workflow: `.github/workflows/deploy-cloud-run.yml`

| Secret | Value |
|--------|-------|
| `GCP_PROJECT_ID` | `aiosrecruitment` |
| `DB_PROJECT_ID` | `harmoviajobs` (optional) |
| `GCP_SA_KEY` | Service account JSON for `aiosrecruitment` |
| `GAR_REPO` | `platform-repo` (optional) |

## Demo logins (after db:init)

| Workspace | Email | Password |
|-----------|-------|----------|
| staffpro-agency | admin@aios.com | password123 |
| talentbridge | admin@talentbridge.com | password123 |
| platform | super@aios.com | password123 |
