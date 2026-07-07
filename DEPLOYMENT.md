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
DATABASE_URL=postgresql://app_user:YOUR_PASSWORD@/harmoviajobs_courses_db?host=/cloudsql/harmoviajobs:us-central1:harmoviajobs-db-us1&schema=harmirecruit
```

Schema is embedded in the URL (`&schema=harmirecruit`). Stored in Secret Manager (`aiosrecruitment`) as `harmirecruit-db-url`.

## One-time setup

```bash
gcloud auth login
gcloud config set project aiosrecruitment

chmod +x scripts/gcp-setup.sh
DB_PASSWORD='your-cloud-sql-app-user-password' AUTO_DEPLOY=1 ./scripts/gcp-setup.sh
```

The script:
1. Enables APIs on `aiosrecruitment`
2. Creates Artifact Registry, service account, secrets
3. Grants `roles/cloudsql.client` on **`harmoviajobs`** to the app service account
4. Optionally builds and deploys Cloud Run

### Initialize database schema

```bash
cloud-sql-proxy harmoviajobs:us-central1:harmoviajobs-db-us1 &

DATABASE_URL="postgresql://app_user:YOUR_PASSWORD@127.0.0.1:5432/harmoviajobs_courses_db?schema=harmirecruit" \
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

Authentication uses **Workload Identity Federation** (OIDC) — no long-lived service account JSON key is stored in GitHub.

| Setting | Value |
|---------|-------|
| GCP project | `aiosrecruitment` (number: `449927939885`) |
| GitHub repo | `harmoviam/AIOS_Recruitment` |
| Deploy service account | `github-actions-deploy@aiosrecruitment.iam.gserviceaccount.com` |
| Runtime service account | `cloud-run-harmirecruit-sa@aiosrecruitment.iam.gserviceaccount.com` |
| Workload Identity Pool | `github-pool` |
| OIDC Provider | `github-provider` |
| Provider path | `projects/449927939885/locations/global/workloadIdentityPools/github-pool/providers/github-provider` |

### Optional GitHub secrets

| Secret | Value |
|--------|-------|
| `GCP_PROJECT_ID` | `aiosrecruitment` (defaults to this if unset) |
| `DB_PROJECT_ID` | `harmoviajobs` (optional) |
| `GAR_REPO` | `platform-repo` (optional) |

### One-time WIF setup (GCP)

Run once per project. Requires `gcloud` authenticated to `aiosrecruitment`.

```bash
PROJECT_ID=aiosrecruitment
PROJECT_NUMBER=449927939885
REPO=harmoviam/AIOS_Recruitment
DEPLOY_SA=github-actions-deploy
RUNTIME_SA=cloud-run-harmirecruit-sa

gcloud iam service-accounts create $DEPLOY_SA \
  --display-name="GitHub Actions deploy" \
  --project=$PROJECT_ID

DEPLOY_SA_EMAIL="${DEPLOY_SA}@${PROJECT_ID}.iam.gserviceaccount.com"

for ROLE in roles/run.admin roles/artifactregistry.writer roles/iam.serviceAccountUser; do
  gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:${DEPLOY_SA_EMAIL}" \
    --role="$ROLE"
done

gcloud iam service-accounts add-iam-policy-binding \
  "${RUNTIME_SA}@${PROJECT_ID}.iam.gserviceaccount.com" \
  --member="serviceAccount:${DEPLOY_SA_EMAIL}" \
  --role="roles/iam.serviceAccountUser" \
  --project=$PROJECT_ID

gcloud iam workload-identity-pools create github-pool \
  --location=global \
  --display-name="GitHub Actions" \
  --project=$PROJECT_ID

gcloud iam workload-identity-pools providers create-oidc github-provider \
  --location=global \
  --workload-identity-pool=github-pool \
  --display-name="GitHub OIDC" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository=='${REPO}'" \
  --project=$PROJECT_ID

gcloud iam service-accounts add-iam-policy-binding $DEPLOY_SA_EMAIL \
  --project=$PROJECT_ID \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github-pool/attribute.repository/${REPO}"
```

### Manual workflow trigger

```bash
gh workflow run deploy-cloud-run.yml --ref main
```

## Demo logins (after db:init)

| Workspace | Email | Password |
|-----------|-------|----------|
| staffpro-agency | admin@aios.com | password123 |
| talentbridge | admin@talentbridge.com | password123 |
| platform | super@aios.com | password123 |
