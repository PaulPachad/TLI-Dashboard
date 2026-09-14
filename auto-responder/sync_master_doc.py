"""
Live Master Google Doc Topic Synchronizer.
Directly syncs interview series topics and questionnaire links from:
https://docs.google.com/document/d/18ES4sOuMdqc4FWsmHBzbIoxYOCB2f-ukE4IoG_1N0dY/edit
"""

import os
import re
import sys
import json
import urllib.request
import urllib.parse
from datetime import datetime
from typing import List, Dict, Any, Tuple
from bs4 import BeautifulSoup

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MASTER_DOC_URL = "https://docs.google.com/document/d/18ES4sOuMdqc4FWsmHBzbIoxYOCB2f-ukE4IoG_1N0dY/export?format=html"
JSON_DB_PATH = os.path.join(BASE_DIR, "data", "interview_series.json")
RELOAD_FLAG_PATH = os.path.join(BASE_DIR, "data", ".reload_topics")

sys.path.insert(0, BASE_DIR)
from rebuild_database import heal_mojibake
from matcher import normalize_topic_for_exact, decompose_pitch_topic


SKIP_SECTIONS = {"Other Links"}
SKIP_TOPICS = {
    "instructions and answers to frequently asked questions",
    "generic 5 things questions",
    "authority magazine faq and instructions",
    "writers portal",
    "template email for article removal",
    "formal response to an individual pitch",
    "mass include you letter to send to a group of people",
    "tli momentum plan",
    "tli strategy kickoff call",
    "best next steps after interviews come in",
    "email for live links",
    "common editorial mistakes to look out for",
    "would like to include you letter",
    "follow up skype call",
    "authority magazine welcome",
    "guidelines for writing op-eds and first-person articles in authority magazine",
    "making a thank you video for each interview series",
    "top annual business or tech conventions",
    "authority magazine logos's and video intros",
    "text for twitter, facebook, and slack group announcements",
    "sample authority magazine newsletter insert",
    "email for press opportunities",
    "why we can't change or take down article",
    "message about suspension",
    "request for a group zoom call",
    "zoom interview or written interview",
}


def generate_title_formula(topic_name: str) -> str:
    """Generate a standard title formula for a topic name."""
    clean = re.sub(r'\s+', ' ', topic_name).strip()
    if re.match(r'^(?:5|five)\s+things', clean, re.IGNORECASE):
        return f"(Name & Company): {clean}"
    if ":" in clean:
        prefix, suffix = clean.split(":", 1)
        return f"{prefix.strip()}: (Name & Company) On {suffix.strip()}"
    return f"(Name & Company) On {clean}"


def extract_topics_from_master_doc() -> List[Dict[str, str]]:
    """Fetch and parse live Google Doc for interview series and questionnaire links."""
    req = urllib.request.Request(MASTER_DOC_URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        html = resp.read().decode("utf-8")

    soup = BeautifulSoup(html, "html.parser")
    topics = []
    seen_doc_ids = set()
    current_category = "General"

    for elem in soup.find_all(["h1", "h2", "p", "li"]):
        # Track section headings
        if elem.name in ["h1", "h2"]:
            heading_text = heal_mojibake(elem.get_text(strip=True))
            if heading_text and "INTERVIEW QUESTION TEMPLATES" not in heading_text:
                current_category = heading_text
            continue

        if current_category in SKIP_SECTIONS:
            continue

        for a in elem.find_all("a"):
            href = a.get("href", "")
            if "google.com/url?q=" in href:
                q = re.search(r'q=([^&]+)', href)
                if q:
                    href = urllib.parse.unquote(q.group(1))

            if "docs.google.com/document/d/" in href:
                doc_id_m = re.search(r'docs\.google\.com/document/d/([a-zA-Z0-9_-]+)', href)
                if not doc_id_m:
                    continue
                gdoc_id = doc_id_m.group(1)
                clean_link = f"https://docs.google.com/document/d/{gdoc_id}/edit"

                text = heal_mojibake(a.get_text(strip=True))
                # Remove emojis and extra whitespace
                text = re.sub(r'[\U00010000-\U0010ffff]', '', text).strip()
                text = re.sub(r'\s+', ' ', text).strip()

                if len(text) < 4:
                    continue

                text_clean_lower = re.sub(r'["\']', '', text.lower())
                if any(skip in text_clean_lower for skip in SKIP_TOPICS):
                    continue

                if gdoc_id not in seen_doc_ids:
                    seen_doc_ids.add(gdoc_id)
                    topics.append({
                        "name": text,
                        "link": clean_link,
                        "category": current_category,
                        "gdoc_id": gdoc_id
                    })

    return topics


def sync_topics(dry_run: bool = True) -> Tuple[int, List[Dict[str, str]]]:
    """Compare live Google Doc against local catalog and optionally apply updates."""
    with open(JSON_DB_PATH, "r", encoding="utf-8") as f:
        local_series = json.load(f)

    local_normalized = {normalize_topic_for_exact(s["name"]): s for s in local_series}
    local_doc_ids = {
        re.search(r'docs\.google\.com/document/d/([a-zA-Z0-9_-]+)', s.get("link", "")).group(1)
        for s in local_series
        if re.search(r'docs\.google\.com/document/d/([a-zA-Z0-9_-]+)', s.get("link", ""))
    }

    live_topics = extract_topics_from_master_doc()
    new_topics = []

    for item in live_topics:
        norm_name = normalize_topic_for_exact(item["name"])
        if norm_name not in local_normalized and item["gdoc_id"] not in local_doc_ids:
            new_topics.append(item)

    if not dry_run and new_topics:
        max_id = max((s.get("id", 0) for s in local_series), default=0)
        for idx, item in enumerate(new_topics, 1):
            topic_id = max_id + idx
            formula = generate_title_formula(item["name"])
            keywords = [w for w in item["name"].lower().split() if len(w) > 3]

            local_series.append({
                "id": topic_id,
                "name": item["name"],
                "category": item["category"],
                "link": item["link"],
                "title_formula": formula,
                "keywords": keywords
            })

        # Save updated database
        with open(JSON_DB_PATH, "w", encoding="utf-8") as f:
            json.dump(local_series, f, indent=2, ensure_ascii=False)

        # Mirror updates to CSV backup file if available
        try:
            import csv
            import rebuild_database
            csv_path = rebuild_database.get_csv_path()
            if csv_path and os.path.exists(csv_path):
                is_utf8 = True
                try:
                    with open(csv_path, 'r', encoding='utf-8') as f:
                        f.read()
                except UnicodeDecodeError:
                    is_utf8 = False
                encoding = 'utf-8' if is_utf8 else 'cp1252'
                with open(csv_path, 'a', encoding=encoding, errors='replace', newline='') as f:
                    writer = csv.writer(f)
                    for item in new_topics:
                        formula = generate_title_formula(item["name"])
                        writer.writerow([item["name"], item["link"], formula])
        except Exception as e:
            print(f"[Warning] Failed to update CSV backup: {e}")

        # Trigger live daemon hot reload
        with open(RELOAD_FLAG_PATH, "w", encoding="utf-8") as f:
            f.write(datetime.now().isoformat())

    return len(live_topics), new_topics


if __name__ == "__main__":
    apply_mode = "--apply" in sys.argv
    print(f"Connecting to live Master Google Doc: {MASTER_DOC_URL}...")
    total_live, new_found = sync_topics(dry_run=not apply_mode)

    print(f"Total topics scanned in Live Master Google Doc: {total_live}")
    print(f"New topics discovered: {len(new_found)}")

    if new_found:
        print("\nNew Topics List:")
        for idx, t in enumerate(new_found, 1):
            print(f"  {idx}. [{t['category']}] {t['name']}")
            print(f"     Link: {t['link']}")

    if apply_mode:
        print(f"\n[SUCCESS] Applied {len(new_found)} new topics to local database and signaled live daemon hot-reload!")
    else:
        print("\nRun with --apply to automatically add these topics to your database and hot-reload the daemon.")
