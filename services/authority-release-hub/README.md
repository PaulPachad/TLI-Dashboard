# Authority Magazine — Friday Release Hub (FastAPI + Cloud Run)

This standalone **FastAPI** application replaces the 6-minute-limited Google Apps Script loop (`MockupBridge.gs`) with a single continuous Python service hosted on your existing Google Cloud project (`tli-dashboard-499512`) and accessible at **`https://release.authoritymag.co`**.

## Why This Eliminates Every Apps Script Failure

1. **60-Minute Continuous Runtime (Zero 1-Minute Triggers)**: Cloud Run services support up to 60-minute continuous execution (`--timeout=3600`), eliminating the 6-minute Apps Script guillotine, 9 KB `ScriptProperties` limit, and cursor amnesia.
2. **Parallel Portal Scanning (~3 Seconds)**: Reads all 46 writer portals from your Master Dashboard (`1wW97ts5RGVXM1AZc-2YnmHH0FbNAzq7gyDohfwrMvto`) via the Google Sheets API without opening spreadsheets one by one in Apps Script.
3. **Direct GCS -> Google Drive Sync**: Reads rendered `.png` files directly from `gs://tli-dashboard-499512-authority-mockup-staging/previews/` and uploads them straight to your Google Drive `Weekly Mockups` folder (`1AQOCBkVbPXzXslED2MTJrAvXxVsvUOYb`).
4. **Mathematical Mockup-First Email Guard (Both Live & Follow-Up Emails)**: `build_strict_mockup_mime_message()` in `main.py` refuses to build a MIME message unless `len(png_bytes) >= 10000` and attaches the PNG both inline (`cid:mockupPreview`) and as `Authority-Magazine-3D-Mockup.png`.

## How to Deploy in 2 Minutes Using Google Cloud Shell

1. Open [Google Cloud Console (`tli-dashboard-499512`)](https://console.cloud.google.com/run?project=tli-dashboard-499512) and click the **Activate Cloud Shell** icon (`>_`) in the top right.
2. Upload `authority_release_hub.zip`, unzip it, and run the deployment script:
   ```bash
   unzip authority_release_hub.zip -d authority_release_hub
   cd authority_release_hub
   bash deploy_cloud_run.sh
   ```
3. To put it on **`release.authoritymag.co`**, add a single DNS record in your `authoritymag.co` DNS settings:
   - **Type**: `CNAME`
   - **Host / Name**: `release`
   - **Value / Target**: `ghs.googlehosted.com.`
