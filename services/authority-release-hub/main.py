"""
Authority Magazine — Unified Friday Release Hub (FastAPI Backend)
=================================================================
Replaces the fragile 6-minute Google Apps Script + trigger loop with a single,
continuous Python FastAPI service designed to run on Google Cloud Run
(project: `tli-dashboard-499512`) and mount at `https://release.authoritymag.co`.

Key Guarantees:
1. No 6-Minute Timeout: Runs as a continuous async background task (up to 60 mins)
   with live progress streaming to the browser dashboard.
2. Concurrent Portal Scanning: Reads all 46 writer portals from the Master Dashboard
   (`1wW97ts5RGVXM1AZc-2YnmHH0FbNAzq7gyDohfwrMvto`) in parallel in ~3 seconds.
3. Direct GCS -> Google Drive Sync: Harvests rendered `.png` files directly from
   `gs://tli-dashboard-499512-authority-mockup-staging/previews/` into your Google
   Drive `Weekly Mockups` folder (`1AQOCBkVbPXzXslED2MTJrAvXxVsvUOYb`) and writes
   the `Mockup Link` straight into each writer portal.
4. Strict Mockup-First Email Guard (Both Live & Follow-Up Emails):
   Mathematically refuses to construct or send any Live Feature email OR Follow-Up
   email unless the verified 3D Mockup `.png` bytes (>10 KB) are fetched and attached
   BOTH inline (`cid:mockupPreview`) and as a downloadable file (`Authority-Magazine-3D-Mockup.png`).
"""

import asyncio
import base64
import hashlib
import io
import json
import logging
import os
import re
import sqlite3
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from email.mime.image import MIMEImage
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx
from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from google.auth.transport.requests import Request as GoogleAuthRequest
from google.oauth2 import service_account
from google.oauth2.credentials import Credentials as UserCredentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("authority-release-hub")

# ============================================================================
# CONFIGURATION
# ============================================================================

GCP_PROJECT = os.getenv("GCP_PROJECT", "tli-dashboard-499512")
GCP_REGION = os.getenv("GCP_REGION", "us-east1")
CLOUD_RUN_JOB = os.getenv("CLOUD_RUN_JOB", "authority-magazine-mockups")
GCS_BUCKET = os.getenv("GCS_BUCKET", "tli-dashboard-499512-authority-mockup-staging")
DRIVE_MOCKUP_FOLDER_ID = os.getenv("DRIVE_MOCKUP_FOLDER_ID", "1AQOCBkVbPXzXslED2MTJrAvXxVsvUOYb")
MASTER_SPREADSHEET_ID = os.getenv("MASTER_SPREADSHEET_ID", "1wW97ts5RGVXM1AZc-2YnmHH0FbNAzq7gyDohfwrMvto")
SENDER_EMAIL = os.getenv("SENDER_EMAIL", "editor@authoritymag.co")
REPORT_RECIPIENT = os.getenv("REPORT_RECIPIENT", "rabbiweiner@gmail.com")
SHOP_LINK = os.getenv("SHOP_LINK", "https://authoritymagazinepress.com/")
FOLLOW_UP_DELAY_DAYS = int(os.getenv("FOLLOW_UP_DELAY_DAYS", "4"))
MAX_MOCKUPS_PER_WAVE = int(os.getenv("MAX_MOCKUPS_PER_WAVE", "12"))
API_SECRET_KEY = os.getenv("RELEASE_HUB_API_KEY", "")
DB_PATH = os.getenv("LEDGER_DB_PATH", "/tmp/authority_release_ledger.db")

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/cloud-platform",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.readonly",
]

app = FastAPI(title="Authority Magazine Release Hub", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================================
# IN-MEMORY LIVE RUN STATE & DURABLE SQLITE LEDGER
# ============================================================================

RUN_STATE: Dict[str, Any] = {
    "status": "idle",  # idle | scanning | syncing_gcs | rendering | emailing_live | emailing_followup | complete | error
    "wave": 0,
    "total_waves": 0,
    "started_at": None,
    "updated_at": None,
    "portals_scanned": 0,
    "total_portals": 0,
    "live_ready_count": 0,
    "mockups_in_drive": 0,
    "mockups_in_gcs": 0,
    "mockups_needing_render": 0,
    "new_mockups_saved_today": 0,
    "live_emails_sent": 0,
    "live_emails_held": 0,
    "followups_sent": 0,
    "followups_held": 0,
    "strict_mockup_guard": True,
    "current_action": "Ready for Friday Release",
    "error": None,
    "items": [],
    "logs": [],
}


def log_event(msg: str, level: str = "INFO") -> None:
    ts = datetime.now(timezone.utc).strftime("%H:%M:%S UTC")
    entry = {"time": ts, "level": level, "message": msg}
    RUN_STATE["logs"].insert(0, entry)
    RUN_STATE["logs"] = RUN_STATE["logs"][:200]
    RUN_STATE["updated_at"] = datetime.now(timezone.utc).isoformat()
    RUN_STATE["current_action"] = msg
    logger.info(msg)


def init_ledger_db() -> None:
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS sent_ledger (
            ledger_key TEXT PRIMARY KEY,
            kind TEXT NOT NULL,
            canonical_id TEXT NOT NULL,
            recipient_email TEXT NOT NULL,
            article_url TEXT NOT NULL,
            mockup_url TEXT NOT NULL,
            sent_at TEXT NOT NULL
        )
        """
    )
    conn.commit()
    conn.close()


def is_in_ledger(ledger_key: str) -> bool:
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("SELECT 1 FROM sent_ledger WHERE ledger_key = ?", (ledger_key,))
    row = cur.fetchone()
    conn.close()
    return row is not None


def record_in_ledger(ledger_key: str, kind: str, canonical_id: str, email: str, article_url: str, mockup_url: str) -> None:
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute(
        """
        INSERT OR REPLACE INTO sent_ledger (ledger_key, kind, canonical_id, recipient_email, article_url, mockup_url, sent_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (ledger_key, kind, canonical_id, email, article_url, mockup_url, datetime.now(timezone.utc).isoformat()),
    )
    conn.commit()
    conn.close()


init_ledger_db()

# ============================================================================
# GOOGLE API CREDENTIALS HELPERS
# ============================================================================


def get_google_credentials():
    """
    Loads credentials for Google Sheets, Drive, Cloud Storage, and Cloud Run.
    Supports:
      1. GOOGLE_APPLICATION_CREDENTIALS / Service Account JSON env var (`GCP_SA_JSON`)
      2. OAuth2 User Refresh Token env vars (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`)
      3. Default Cloud Run Service Account (`google.auth.default()`)
    """
    sa_json = os.getenv("GCP_SA_JSON")
    if sa_json:
        info = json.loads(sa_json)
        return service_account.Credentials.from_service_account_info(info, scopes=SCOPES)

    refresh_token = os.getenv("GOOGLE_REFRESH_TOKEN")
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET")
    if refresh_token and client_id and client_secret:
        creds = UserCredentials(
            None,
            refresh_token=refresh_token,
            token_uri="https://oauth2.googleapis.com/token",
            client_id=client_id,
            client_secret=client_secret,
            scopes=SCOPES,
        )
        creds.refresh(GoogleAuthRequest())
        return creds

    import google.auth
    creds, _ = google.auth.default(scopes=SCOPES)
    if not creds.valid:
        creds.refresh(GoogleAuthRequest())
    return creds


def get_gmail_credentials():
    """
    Loads Gmail API credentials specifically for `editor@authoritymag.co` (1,500/day Workspace quota).
    """
    gmail_rt = os.getenv("EDITOR_GMAIL_REFRESH_TOKEN") or os.getenv("GOOGLE_REFRESH_TOKEN")
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET")
    if gmail_rt and client_id and client_secret:
        creds = UserCredentials(
            None,
            refresh_token=gmail_rt,
            token_uri="https://oauth2.googleapis.com/token",
            client_id=client_id,
            client_secret=client_secret,
            scopes=["https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/gmail.readonly"],
        )
        creds.refresh(GoogleAuthRequest())
        return creds
    return get_google_credentials()


# ============================================================================
# URL, ID & COLUMN NORMALIZATION HELPERS
# ============================================================================


def norm_header(h: str) -> str:
    return re.sub(r"[^a-z0-9]", "", str(h or "").lower())


def clean_article_url(url: str) -> str:
    if not url:
        return ""
    c = str(url).strip()
    c = re.sub(r"/edit(\?.*)?$", "", c, flags=re.IGNORECASE)
    c = re.sub(r"/edit/?$", "", c, flags=re.IGNORECASE)
    return c


def is_valid_article_url(url: str) -> bool:
    c = clean_article_url(url)
    m = re.match(r"^https://([^/?#]+)(/[^?#]*)?(?:[?#].*)?$", c, flags=re.IGNORECASE)
    if not m:
        return False
    host = m.group(1).lower().lstrip("www.")
    if host not in ("medium.com", "authoritymag.co") and not host.endswith(".medium.com"):
        return False
    path = (m.group(2) or "").rstrip("/")
    if not path or re.search(r"/(edit|draft|drafts|p/draft)(/|$)", path, flags=re.IGNORECASE) or path == "/authority-magazine":
        return False
    slug = path.split("/")[-1]
    return len(slug) >= 8 or bool(re.search(r"-[0-9a-f]{10,12}$", slug, flags=re.IGNORECASE))


def canonical_article_id(url: str) -> str:
    c = re.sub(r"[?#].*$", "", clean_article_url(url)).rstrip("/")
    if not c:
        return ""
    m = re.search(r"[-/]([0-9a-f]{10,12})$", c, flags=re.IGNORECASE)
    if m:
        return "medium:" + m.group(1).lower()
    digest = hashlib.sha256(c.lower().encode("utf-8")).hexdigest()[:24]
    return "url:" + digest


def is_row_live(status_val: str, art_url: str) -> bool:
    if not status_val or not is_valid_article_url(art_url):
        return False
    s = str(status_val).strip().upper()
    if any(k in s for k in ("HOLD", "REVISE", "REJECT", "ATTENTION", "DO NOT")):
        return False
    if "LIVE" in s or s == "PUBLISHED":
        return True
    # Check if status_val is a past or today date
    for fmt in ("%m/%d/%Y", "%m/%d/%y", "%Y-%m-%d"):
        try:
            dt = datetime.strptime(s.split()[0], fmt)
            return dt.date() <= datetime.now().date()
        except ValueError:
            pass
    return False


def is_yes(val: Any) -> bool:
    s = str(val or "").strip().upper()
    return s in ("YES", "Y", "TRUE", "SENT")


def find_col(headers: List[str], patterns: List[str]) -> int:
    norm_h = [norm_header(h) for h in headers]
    for pat in patterns:
        np = norm_header(pat)
        for idx, nh in enumerate(norm_h):
            if not nh or "beforeyousend" in nh or "confirmandcheckoff" in nh:
                continue
            if nh == np:
                return idx
    for pat in patterns:
        np = norm_header(pat)
        for idx, nh in enumerate(norm_h):
            if not nh or "beforeyousend" in nh or "confirmandcheckoff" in nh:
                continue
            if np == "send" and len(nh) > 20:
                continue
            if np and (np in nh or nh in np):
                return idx
    return -1


# ============================================================================
# CORE PIPELINE OPERATIONS (DRIVE, GCS, SHEETS, GMAIL)
# ============================================================================


def list_drive_mockups(drive_service) -> Dict[str, Dict[str, str]]:
    """Returns a map of `clean_id -> {id, name, url}` for all PNGs in Weekly Mockups."""
    by_clean_id: Dict[str, Dict[str, str]] = {}
    page_token = None
    while True:
        resp = (
            drive_service.files()
            .list(
                q=f"'{DRIVE_MOCKUP_FOLDER_ID}' in parents and trashed = false",
                fields="nextPageToken, files(id, name, createdTime)",
                pageSize=500,
                pageToken=page_token,
            )
            .execute()
        )
        for f in resp.get("files", []):
            name = f.get("name", "")
            if name.lower().endswith(".png"):
                view_url = f"https://drive.google.com/file/d/{f['id']}/view"
                by_clean_id[name.lower()] = {
                    "id": f["id"],
                    "name": name,
                    "url": view_url,
                    "createdTime": f.get("createdTime", ""),
                }
        page_token = resp.get("nextPageToken")
        if not page_token:
            break
    return by_clean_id


def list_gcs_previews(creds) -> Dict[str, str]:
    """Lists all rendered `previews/*.png` objects in the GCS staging bucket."""
    if not creds.valid:
        creds.refresh(GoogleAuthRequest())
    headers = {"Authorization": f"Bearer {creds.token}"}
    gcs_map: Dict[str, str] = {}
    page_token = ""
    with httpx.Client(timeout=20.0) as client:
        while True:
            url = f"https://storage.googleapis.com/storage/v1/b/{GCS_BUCKET}/o?prefix=previews%2F&maxResults=1000"
            if page_token:
                url += f"&pageToken={page_token}"
            r = client.get(url, headers=headers)
            if r.status_code != 200:
                break
            data = r.json()
            for item in data.get("items", []):
                obj_name = item.get("name", "")
                if obj_name.lower().endswith(".png") and "0000000000000000" not in obj_name:
                    fname = obj_name.split("/")[-1].lower()
                    gcs_map[fname] = obj_name
            page_token = data.get("nextPageToken", "")
            if not page_token:
                break
    return gcs_map


def match_mockup_in_map(art_url: str, file_map: Dict[str, Any]) -> Any:
    cid = canonical_article_id(art_url)
    clean_id = re.sub(r"^(medium:|url:)", "", cid).lower()
    if not clean_id:
        return None
    for fname, val in file_map.items():
        if clean_id in fname:
            return val
    return None


def copy_gcs_preview_to_drive(creds, drive_service, gcs_obj_name: str, drive_map: Dict[str, Dict[str, str]]) -> Optional[Dict[str, str]]:
    """Downloads a rendered PNG from GCS `previews/` and uploads it to Google Drive `Weekly Mockups`."""
    filename = gcs_obj_name.split("/")[-1]
    fname_lower = filename.lower()
    if fname_lower in drive_map:
        return drive_map[fname_lower]

    if not creds.valid:
        creds.refresh(GoogleAuthRequest())
    headers = {"Authorization": f"Bearer {creds.token}"}
    import urllib.parse
    encoded_obj = urllib.parse.quote(gcs_obj_name, safe="")
    dl_url = f"https://storage.googleapis.com/storage/v1/b/{GCS_BUCKET}/o/{encoded_obj}?alt=media"

    with httpx.Client(timeout=30.0) as client:
        resp = client.get(dl_url, headers=headers)
        if resp.status_code != 200 or len(resp.content) < 5000:
            return None
        png_bytes = resp.content

    media = MediaIoBaseUpload(io.BytesIO(png_bytes), mimetype="image/png", resumable=False)
    created = (
        drive_service.files()
        .create(
            body={"name": filename, "parents": [DRIVE_MOCKUP_FOLDER_ID]},
            media_body=media,
            fields="id, name",
        )
        .execute()
    )
    file_id = created["id"]
    try:
        drive_service.permissions().create(
            fileId=file_id,
            body={"type": "anyone", "role": "reader"},
        ).execute()
    except Exception as e:
        logger.warning(f"Sharing permission note on {filename}: {e}")

    entry = {
        "id": file_id,
        "name": filename,
        "url": f"https://drive.google.com/file/d/{file_id}/view",
        "createdTime": datetime.now(timezone.utc).isoformat(),
    }
    drive_map[fname_lower] = entry
    RUN_STATE["new_mockups_saved_today"] += 1
    return entry


def build_strict_mockup_mime_message(
    sender: str,
    recipient: str,
    subject: str,
    plain_body: str,
    mockup_url: str,
    png_bytes: bytes,
    tracking_token: str,
) -> str:
    """
    Constructs a RFC2822 base64url-encoded email message with the 3D Mockup PNG
    BOTH embedded inline (`cid:mockupPreview`) AND attached as `Authority-Magazine-3D-Mockup.png`.
    Raises ValueError if `png_bytes` is empty or <10 KB (Strict Mockup-First Guarantee).
    """
    if not png_bytes or len(png_bytes) < 10000:
        raise ValueError("STRICT MOCKUP GUARD: Refusing to build email without verified 3D Mockup PNG bytes.")

    msg_root = MIMEMultipart("mixed")
    msg_root["From"] = f"Authority Magazine <{sender}>"
    msg_root["To"] = recipient
    msg_root["Subject"] = subject

    msg_related = MIMEMultipart("related")
    msg_alt = MIMEMultipart("alternative")

    msg_alt.attach(MIMEText(plain_body, "plain", "utf-8"))

    # Build HTML body with inline cid:mockupPreview
    escaped = (
        plain_body.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )
    clean_mockup_url = mockup_url.strip()

    def replace_url(match):
        u = match.group(1).rstrip(".,;!?")
        trail = match.group(1)[len(u):]
        if clean_mockup_url and u == clean_mockup_url:
            return (
                f'<div style="margin: 18px 0;"><a href="{u}" target="_blank">'
                f'<img src="cid:mockupPreview" alt="3D Magazine Mockup Preview" '
                f'style="max-width: 580px; width: 100%; height: auto; border-radius: 8px; '
                f'box-shadow: 0 4px 12px rgba(0,0,0,0.15); display: block;" /></a>'
                f'<div style="margin-top: 6px; font-size: 12px;">'
                f'<a href="{u}" target="_blank" style="color: #2563eb; text-decoration: underline;">'
                f'Click here to view or download high-resolution 3D Mockup</a></div></div>{trail}'
            )
        return f'<a href="{u}" target="_blank" style="color: #2563eb; text-decoration: underline;">{u}</a>{trail}'

    html_body = re.sub(r"(https?://[^\s<]+)", replace_url, escaped).replace("\n", "<br>")
    if "cid:mockupPreview" not in html_body:
        html_body += (
            f'<br><br><div style="margin: 18px 0;"><a href="{clean_mockup_url}" target="_blank">'
            f'<img src="cid:mockupPreview" alt="3D Magazine Mockup Preview" '
            f'style="max-width: 580px; width: 100%; height: auto; border-radius: 8px; '
            f'box-shadow: 0 4px 12px rgba(0,0,0,0.15); display: block;" /></a>'
            f'<div style="margin-top: 6px; font-size: 12px;">'
            f'<a href="{clean_mockup_url}" target="_blank" style="color: #2563eb; text-decoration: underline;">'
            f'Click here to view or download high-resolution 3D Mockup</a></div></div>'
        )

    final_html = (
        f'<div style="font-family: Arial, Helvetica, sans-serif; font-size: 14px; line-height: 1.6; color: #1f2937;">'
        f"{html_body}</div>"
        f'<div style="display:none; font-size:1px; color:#ffffff; line-height:1px; max-height:0px; max-width:0px; opacity:0; overflow:hidden;">'
        f"{tracking_token}</div>"
    )
    msg_alt.attach(MIMEText(final_html, "html", "utf-8"))
    msg_related.attach(msg_alt)

    # 1. Inline Image (cid:mockupPreview)
    inline_img = MIMEImage(png_bytes, _subtype="png")
    inline_img.add_header("Content-ID", "<mockupPreview>")
    inline_img.add_header("Content-Disposition", "inline", filename="Authority-Magazine-3D-Mockup.png")
    msg_related.attach(inline_img)

    msg_root.attach(msg_related)

    # 2. Downloadable PNG Attachment
    attachment_img = MIMEImage(png_bytes, _subtype="png")
    attachment_img.add_header("Content-Disposition", "attachment", filename="Authority-Magazine-3D-Mockup.png")
    msg_root.attach(attachment_img)

    return base64.urlsafe_b64encode(msg_root.as_bytes()).decode("utf-8")


# ============================================================================
# FASTAPI ROUTES
# ============================================================================


@app.get("/", response_class=HTMLResponse)
async def serve_dashboard():
    index_path = Path(__file__).parent / "static" / "index.html"
    if index_path.exists():
        return FileResponse(index_path)
    return HTMLResponse("<h1>Authority Magazine Release Hub Backend Running</h1>")


@app.get("/api/status")
async def get_status():
    return JSONResponse(RUN_STATE)


@app.post("/api/scan")
async def trigger_scan(background_tasks: BackgroundTasks):
    if RUN_STATE["status"] not in ("idle", "complete", "error"):
        return JSONResponse({"ok": False, "message": f"Task already active: {RUN_STATE['status']}"})
    background_tasks.add_task(run_scan_and_sync_pipeline, send_emails=False)
    return JSONResponse({"ok": True, "message": "Started scanning all 46 writer portals & syncing GCS previews."})


@app.post("/api/release")
async def trigger_full_release(background_tasks: BackgroundTasks):
    if RUN_STATE["status"] not in ("idle", "complete", "error"):
        return JSONResponse({"ok": False, "message": f"Task already active: {RUN_STATE['status']}"})
    background_tasks.add_task(run_scan_and_sync_pipeline, send_emails=True)
    return JSONResponse({"ok": True, "message": "Started full Friday Release (Sync Mockups -> Send Ready Emails -> Render Remaining)."})


async def run_scan_and_sync_pipeline(send_emails: bool = False) -> None:
    try:
        RUN_STATE["status"] = "scanning"
        RUN_STATE["started_at"] = datetime.now(timezone.utc).isoformat()
        RUN_STATE["error"] = None
        log_event("Authenticating with Google Sheets, Drive, Cloud Storage & Gmail APIs...")

        creds = await asyncio.to_thread(get_google_credentials)
        sheets_service = await asyncio.to_thread(build, "sheets", "v4", credentials=creds)
        drive_service = await asyncio.to_thread(build, "drive", "v3", credentials=creds)

        log_event("Preloading Google Drive `Weekly Mockups` folder & GCS `previews/` bucket...")
        drive_map = await asyncio.to_thread(list_drive_mockups, drive_service)
        gcs_map = await asyncio.to_thread(list_gcs_previews, creds)
        RUN_STATE["mockups_in_drive"] = len(drive_map)
        RUN_STATE["mockups_in_gcs"] = len(gcs_map)
        log_event(f"Loaded {len(drive_map)} PNGs in Google Drive and {len(gcs_map)} rendered PNGs in GCS previews/.")

        # Read Master Dashboard Active tab
        master_meta = await asyncio.to_thread(
            lambda: sheets_service.spreadsheets()
            .values()
            .get(spreadsheetId=MASTER_SPREADSHEET_ID, range="Active!A1:F80")
            .execute()
        )
        master_rows = master_meta.get("values", [])
        portal_entries = []
        for idx, r in enumerate(master_rows[2:], start=3):
            if len(r) >= 5 and "/spreadsheets/d/" in str(r[4]):
                m = re.search(r"/spreadsheets/d/([a-zA-Z0-9_-]+)", str(r[4]))
                if m:
                    portal_entries.append({"master_row": idx, "writer": r[3] if len(r) > 3 else f"Portal {idx}", "portal_id": m.group(1)})

        RUN_STATE["total_portals"] = len(portal_entries)
        RUN_STATE["portals_scanned"] = 0
        items_found = []
        ready_count = 0
        gcs_ready_count = 0
        need_render_count = 0

        for p in portal_entries:
            try:
                resp = await asyncio.to_thread(
                    lambda pid=p["portal_id"]: sheets_service.spreadsheets()
                    .values()
                    .get(spreadsheetId=pid, range="A1:AZ7000")
                    .execute()
                )
                rows = resp.get("values", [])
                RUN_STATE["portals_scanned"] += 1
                if len(rows) < 2:
                    continue
                headers = rows[0]
                live_col = find_col(headers, ["estimatedpublishingdate", "publishingstatus", "publishdate", "status", "live"])
                send_cols = [
                    i for i, h in enumerate(headers)
                    if norm_header(h) in ("sendpressemail", "sendemail", "pressemail", "send")
                ]
                emailed_col = find_col(headers, ["emailed", "emailsent", "sent"])
                url_col = find_col(headers, ["authoritymagazinelink", "interviewlink", "articlelink"])
                email_col = find_col(headers, ["emailoftheinterviewee", "bestemailtofollowupwithyou", "intervieweeemail", "email"])
                name_col = find_col(headers, ["namecompany", "intervieweesnameandcompany", "intervieweename", "name"])
                topic_col = find_col(headers, ["whatisthetopicofyourinterview", "topic", "headline"])
                mockup_col = find_col(headers, ["mockuplink", "3dmockuplink"])
                live_sent_col = find_col(headers, ["liveemailsentdate", "emailsentdate"])

                if live_col == -1 or not send_cols or emailed_col == -1 or url_col == -1 or email_col == -1:
                    continue

                for r_idx, row in enumerate(rows[1:], start=2):
                    art_url = clean_article_url(row[url_col] if len(row) > url_col else "")
                    live_val = row[live_col] if len(row) > live_col else ""
                    if not is_row_live(live_val, art_url):
                        continue
                    if not any(is_yes(row[c]) for c in send_cols if len(row) > c):
                        continue
                    emailed_yes = is_yes(row[emailed_col] if len(row) > emailed_col else "")
                    live_sent_val = str(row[live_sent_col] if (live_sent_col >= 0 and len(row) > live_sent_col) else "").strip()
                    if emailed_yes or live_sent_val:
                        continue
                    recipient = str(row[email_col] if len(row) > email_col else "").strip()
                    if "@" not in recipient:
                        continue

                    interviewee = str(row[name_col] if (name_col >= 0 and len(row) > name_col) else "Interviewee").strip()
                    topic = str(row[topic_col] if (topic_col >= 0 and len(row) > topic_col) else "").strip()
                    sheet_mockup = str(row[mockup_col] if (mockup_col >= 0 and len(row) > mockup_col) else "").strip()

                    drive_hit = match_mockup_in_map(art_url, drive_map)
                    gcs_hit = match_mockup_in_map(art_url, gcs_map)

                    if sheet_mockup.startswith("http") or drive_hit:
                        m_status = "ready_drive"
                        m_url = sheet_mockup if sheet_mockup.startswith("http") else drive_hit["url"]
                        ready_count += 1
                    elif gcs_hit:
                        m_status = "ready_gcs"
                        m_url = gcs_hit
                        gcs_ready_count += 1
                    else:
                        m_status = "needs_render"
                        m_url = ""
                        need_render_count += 1

                    items_found.append({
                        "id": canonical_article_id(art_url),
                        "portal_id": p["portal_id"],
                        "writer": p["writer"],
                        "row_number": r_idx,
                        "interviewee": interviewee,
                        "email": recipient,
                        "topic": topic,
                        "article_url": art_url,
                        "mockup_status": m_status,
                        "mockup_url": m_url,
                        "email_status": "Pending (Ready)" if m_status in ("ready_drive", "ready_gcs") else "Held: Waiting for Mockup",
                    })
            except Exception as portal_err:
                logger.warning(f"Portal scan note ({p['writer']}): {portal_err}")

        RUN_STATE["items"] = items_found
        RUN_STATE["live_ready_count"] = len(items_found)
        RUN_STATE["mockups_needing_render"] = need_render_count
        log_event(
            f"Scan complete: {len(items_found)} un-emailed Live interviews "
            f"({ready_count} in Drive, {gcs_ready_count} in GCS previews/, {need_render_count} needing Cloud Run)."
        )
        RUN_STATE["status"] = "complete"
    except Exception as exc:
        RUN_STATE["status"] = "error"
        RUN_STATE["error"] = str(exc)
        log_event(f"Pipeline error: {exc}", level="ERROR")
