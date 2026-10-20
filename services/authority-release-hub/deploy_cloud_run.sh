#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="tli-dashboard-499512"
REGION="us-east1"
SERVICE_NAME="authority-release-hub"
SUBDOMAIN="release.authoritymag.co"

echo "=== 1. Deploying FastAPI Release Hub to Google Cloud Run ($PROJECT_ID / $REGION) ==="
gcloud run deploy "$SERVICE_NAME" \
  --source . \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --timeout=3600 \
  --cpu=2 \
  --memory=2Gi \
  --min-instances=0 \
  --max-instances=2 \
  --allow-unauthenticated \
  --set-env-vars="GCP_PROJECT=$PROJECT_ID,GCP_REGION=$REGION,CLOUD_RUN_JOB=authority-magazine-mockups,GCS_BUCKET=tli-dashboard-499512-authority-mockup-staging,DRIVE_MOCKUP_FOLDER_ID=1AQOCBkVbPXzXslED2MTJrAvXxVsvUOYb,MASTER_SPREADSHEET_ID=1wW97ts5RGVXM1AZc-2YnmHH0FbNAzq7gyDohfwrMvto,SENDER_EMAIL=editor@authoritymag.co,REPORT_RECIPIENT=rabbiweiner@gmail.com"

echo ""
echo "=== 2. Mapping Custom Subdomain ($SUBDOMAIN) ==="
gcloud beta run domain-mappings create \
  --service "$SERVICE_NAME" \
  --domain "$SUBDOMAIN" \
  --region "$REGION" \
  --project "$PROJECT_ID" || true

echo ""
echo "Deployment complete! Add the CNAME record shown above (pointing 'release' -> 'ghs.googlehosted.com.') in your authoritymag.co DNS."
