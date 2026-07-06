#!/usr/bin/env bash
# One-time GCP setup for AIOS Recruitment (HarmiRecruit).
# App project: aiosrecruitment | Database project: harmoviajobs (cross-project Cloud SQL)
#
# Prerequisites:
#   gcloud auth login
#   gcloud config set project aiosrecruitment
#
# Usage:
#   DB_PASSWORD='your-cloud-sql-app-user-password' ./scripts/gcp-setup.sh
#   DB_PASSWORD='...' AUTO_DEPLOY=1 ./scripts/gcp-setup.sh  # setup + build + deploy

set -euo pipefail

APP_PROJECT_ID="${GCP_PROJECT_ID:-aiosrecruitment}"
DB_PROJECT_ID="${DB_PROJECT_ID:-harmoviajobs}"
REGION="${GCP_REGION:-us-central1}"
GAR_REPO="${GAR_REPO:-platform-repo}"
SERVICE_NAME="harmirecruit"
SA_NAME="cloud-run-harmirecruit-sa"
CLOUDSQL_INSTANCE="harmoviajobs-db-us1"
CLOUDSQL_CONNECTION="${DB_PROJECT_ID}:${REGION}:${CLOUDSQL_INSTANCE}"
DB_SECRET="harmirecruit-db-url"
JWT_SECRET="harmirecruit-jwt-secret"

DB_USER="${DB_USER:-app_user}"
DB_PASSWORD="${DB_PASSWORD:?Set DB_PASSWORD to the Cloud SQL app_user password}"
DB_URL="postgresql://${DB_USER}:${DB_PASSWORD}@/harmoviajobs_courses_db?host=/cloudsql/${CLOUDSQL_CONNECTION}&schema=harmirecruit"

echo "=== HarmiRecruit GCP Setup (cross-project) ==="
echo "App project:  ${APP_PROJECT_ID}"
echo "DB project:   ${DB_PROJECT_ID}"
echo "Cloud SQL:    ${CLOUDSQL_CONNECTION}"
echo "Region:       ${REGION}"
echo "Service:      ${SERVICE_NAME}"
echo ""

gcloud config set project "${APP_PROJECT_ID}"

# --- Enable APIs on app project ---
echo "Enabling APIs on ${APP_PROJECT_ID}..."
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  sqladmin.googleapis.com \
  iam.googleapis.com \
  --project="${APP_PROJECT_ID}"

# --- Artifact Registry ---
if ! gcloud artifacts repositories describe "${GAR_REPO}" \
  --location="${REGION}" --project="${APP_PROJECT_ID}" &>/dev/null; then
  echo "Creating Artifact Registry repo: ${GAR_REPO}"
  gcloud artifacts repositories create "${GAR_REPO}" \
    --repository-format=docker \
    --location="${REGION}" \
    --description="AIOS Recruitment container images" \
    --project="${APP_PROJECT_ID}"
else
  echo "Artifact Registry repo '${GAR_REPO}' already exists"
fi

# --- Service account (app project) ---
SA_EMAIL="${SA_NAME}@${APP_PROJECT_ID}.iam.gserviceaccount.com"
if ! gcloud iam service-accounts describe "${SA_EMAIL}" --project="${APP_PROJECT_ID}" &>/dev/null; then
  echo "Creating service account: ${SA_NAME}"
  gcloud iam service-accounts create "${SA_NAME}" \
    --display-name="Cloud Run HarmiRecruit Service Account" \
    --project="${APP_PROJECT_ID}"
else
  echo "Service account '${SA_NAME}' already exists"
fi

# IAM on app project
gcloud projects add-iam-policy-binding "${APP_PROJECT_ID}" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/secretmanager.secretAccessor" \
  --quiet >/dev/null

# --- Cross-project: Cloud SQL client on DB project ---
echo "Granting Cloud SQL Client on ${DB_PROJECT_ID} to ${SA_EMAIL}..."
gcloud projects add-iam-policy-binding "${DB_PROJECT_ID}" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/cloudsql.client" \
  --quiet >/dev/null
echo "Cross-project IAM granted"

# --- Secrets (app project) ---
if ! gcloud secrets describe "${DB_SECRET}" --project="${APP_PROJECT_ID}" &>/dev/null; then
  echo "Creating secret: ${DB_SECRET}"
  echo -n "${DB_URL}" | gcloud secrets create "${DB_SECRET}" \
    --data-file=- \
    --project="${APP_PROJECT_ID}"
else
  echo "Updating secret: ${DB_SECRET}"
  echo -n "${DB_URL}" | gcloud secrets versions add "${DB_SECRET}" \
    --data-file=- \
    --project="${APP_PROJECT_ID}"
fi

if ! gcloud secrets describe "${JWT_SECRET}" --project="${APP_PROJECT_ID}" &>/dev/null; then
  JWT_VALUE=$(openssl rand -base64 48)
  echo "Creating secret: ${JWT_SECRET}"
  echo -n "${JWT_VALUE}" | gcloud secrets create "${JWT_SECRET}" \
    --data-file=- \
    --project="${APP_PROJECT_ID}"
else
  echo "Secret '${JWT_SECRET}' already exists"
fi

# Grant SA access to secrets
for SECRET in "${DB_SECRET}" "${JWT_SECRET}"; do
  gcloud secrets add-iam-policy-binding "${SECRET}" \
    --project="${APP_PROJECT_ID}" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="roles/secretmanager.secretAccessor" \
    --quiet >/dev/null
done

# --- Cloud Build permissions (default compute SA) ---
PROJECT_NUMBER=$(gcloud projects describe "${APP_PROJECT_ID}" --format='value(projectNumber)')
CB_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"
for ROLE in roles/run.admin roles/artifactregistry.writer roles/iam.serviceAccountUser; do
  gcloud projects add-iam-policy-binding "${APP_PROJECT_ID}" \
    --member="serviceAccount:${CB_SA}" \
    --role="${ROLE}" \
    --quiet >/dev/null 2>&1 || true
done

echo ""
echo "=== Database schema (run once on harmoviajobs Cloud SQL) ==="
echo "  CREATE SCHEMA IF NOT EXISTS harmirecruit;"
echo "  GRANT ALL ON SCHEMA harmirecruit TO app_user;"
echo "  ALTER DEFAULT PRIVILEGES IN SCHEMA harmirecruit GRANT ALL ON TABLES TO app_user;"
echo ""
echo "  DATABASE_URL='postgresql://${DB_USER}:****@/harmoviajobs_courses_db?host=/cloudsql/${CLOUDSQL_CONNECTION}&schema=harmirecruit' npm run db:init"
echo ""

DEPLOY="${AUTO_DEPLOY:-}"
if [[ -z "${DEPLOY}" ]]; then
  read -r -p "Build and deploy now? [y/N] " DEPLOY
fi

if [[ "${DEPLOY}" =~ ^([Yy]|1|true|yes)$ ]]; then
  echo "Submitting Cloud Build..."
  gcloud builds submit \
    --config=cloudbuild.yaml \
    --project="${APP_PROJECT_ID}" \
    --substitutions="_IMAGE_TAG=initial"

  IMAGE="us-central1-docker.pkg.dev/${APP_PROJECT_ID}/${GAR_REPO}/${SERVICE_NAME}:initial"

  echo "Deploying Cloud Run service..."
  gcloud run deploy "${SERVICE_NAME}" \
    --image "${IMAGE}" \
    --region "${REGION}" \
    --project "${APP_PROJECT_ID}" \
    --service-account "${SA_EMAIL}" \
    --add-cloudsql-instances "${CLOUDSQL_CONNECTION}" \
    --set-env-vars "NODE_ENV=production" \
    --set-secrets "DATABASE_URL=${DB_SECRET}:latest,JWT_SECRET=${JWT_SECRET}:latest" \
    --memory 512Mi \
    --cpu 1 \
    --timeout 120 \
    --concurrency 80 \
    --min-instances 0 \
    --max-instances 10 \
    --allow-unauthenticated \
    --port 8080 \
    --execution-environment gen2 \
    --platform managed

  URL=$(gcloud run services describe "${SERVICE_NAME}" \
    --region "${REGION}" \
    --project "${APP_PROJECT_ID}" \
    --format='value(status.url)')
  echo ""
  echo "Deployed: ${URL}"
fi

echo ""
echo "=== GitHub Actions secrets ==="
echo "  GCP_PROJECT_ID       = ${APP_PROJECT_ID}"
echo "  DB_PROJECT_ID        = ${DB_PROJECT_ID}  (optional, for docs)"
echo "  GCP_SA_KEY           = service account JSON for ${APP_PROJECT_ID}"
echo "  GAR_REPO             = ${GAR_REPO}"
echo ""
echo "Setup complete."
