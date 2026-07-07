#!/usr/bin/env bash
# One-time Workload Identity Federation setup for GitHub Actions deploy.
# Run: ./scripts/setup-github-wif.sh

set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-aiosrecruitment}"
PROJECT_NUMBER="${GCP_PROJECT_NUMBER:-449927939885}"
REPO="${GITHUB_REPO:-harmoviam/AIOS_Recruitment}"
DEPLOY_SA="${DEPLOY_SA:-github-actions-deploy}"
RUNTIME_SA="${RUNTIME_SA:-cloud-run-harmirecruit-sa}"
POOL_ID="${WIF_POOL_ID:-github-pool}"
PROVIDER_ID="${WIF_PROVIDER_ID:-github-provider}"

DEPLOY_SA_EMAIL="${DEPLOY_SA}@${PROJECT_ID}.iam.gserviceaccount.com"
RUNTIME_SA_EMAIL="${RUNTIME_SA}@${PROJECT_ID}.iam.gserviceaccount.com"

echo "=== GitHub Actions WIF setup ==="
echo "Project:     ${PROJECT_ID} (${PROJECT_NUMBER})"
echo "GitHub repo: ${REPO}"
echo "Deploy SA:   ${DEPLOY_SA_EMAIL}"
echo "Pool:        ${POOL_ID}"
echo "Provider:    ${PROVIDER_ID}"
echo ""

gcloud config set project "${PROJECT_ID}"

gcloud services enable iamcredentials.googleapis.com sts.googleapis.com iam.googleapis.com \
  --project="${PROJECT_ID}"

if ! gcloud iam service-accounts describe "${DEPLOY_SA_EMAIL}" --project="${PROJECT_ID}" &>/dev/null; then
  echo "Creating deploy service account..."
  gcloud iam service-accounts create "${DEPLOY_SA}" \
    --display-name="GitHub Actions deploy" \
    --project="${PROJECT_ID}"
else
  echo "Deploy service account already exists"
fi

for ROLE in roles/run.admin roles/artifactregistry.writer roles/iam.serviceAccountUser; do
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${DEPLOY_SA_EMAIL}" \
    --role="${ROLE}" \
    --quiet >/dev/null
done

gcloud iam service-accounts add-iam-policy-binding "${RUNTIME_SA_EMAIL}" \
  --member="serviceAccount:${DEPLOY_SA_EMAIL}" \
  --role="roles/iam.serviceAccountUser" \
  --project="${PROJECT_ID}" \
  --quiet >/dev/null

if ! gcloud iam workload-identity-pools describe "${POOL_ID}" \
  --location=global --project="${PROJECT_ID}" &>/dev/null; then
  echo "Creating workload identity pool..."
  gcloud iam workload-identity-pools create "${POOL_ID}" \
    --location=global \
    --display-name="GitHub Actions" \
    --project="${PROJECT_ID}"
else
  echo "Workload identity pool already exists"
fi

if ! gcloud iam workload-identity-pools providers describe "${PROVIDER_ID}" \
  --workload-identity-pool="${POOL_ID}" \
  --location=global --project="${PROJECT_ID}" &>/dev/null; then
  echo "Creating OIDC provider..."
  gcloud iam workload-identity-pools providers create-oidc "${PROVIDER_ID}" \
    --location=global \
    --workload-identity-pool="${POOL_ID}" \
    --display-name="GitHub OIDC" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" \
    --attribute-condition="assertion.repository=='${REPO}'" \
    --project="${PROJECT_ID}"
else
  echo "OIDC provider already exists"
fi

gcloud iam service-accounts add-iam-policy-binding "${DEPLOY_SA_EMAIL}" \
  --project="${PROJECT_ID}" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/attribute.repository/${REPO}" \
  --quiet >/dev/null

echo ""
echo "=== Setup complete ==="
echo "Workload identity provider:"
echo "  projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/providers/${PROVIDER_ID}"
echo ""
echo "Re-run the GitHub Actions workflow after this completes."
