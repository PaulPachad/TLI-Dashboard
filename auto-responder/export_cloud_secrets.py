"""
Utility to export OAuth tokens and credentials as single-line environment variables
for easy copy-pasting into cloud deployment dashboards (Railway, Render, Google Cloud Run).
"""

import os
import json
import base64

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def format_file_as_env(filename: str, json_key: str, b64_key: str):
    path = os.path.join(BASE_DIR, filename)
    if not os.path.exists(path):
        print(f"[-] {filename}: NOT FOUND (skipping)")
        return

    try:
        with open(path, "r", encoding="utf-8") as f:
            content = f.read().strip()
            # Validate JSON
            parsed = json.loads(content)
            compact_json = json.dumps(parsed, separators=(',', ':'))

        b64 = base64.b64encode(compact_json.encode('utf-8')).decode('utf-8')

        print(f"\n[+] {filename} (Found):")
        print(f"    Raw JSON Variable Name:   {json_key}")
        print(f"    Base64 Variable Name:     {b64_key}")
        print(f"\n    --- Value to copy (Compact JSON) ---")
        print(f"{compact_json}")
        print(f"\n    --- OR Value to copy (Base64) ---")
        print(f"{b64}")
    except Exception as e:
        print(f"[-] Error reading {filename}: {e}")


def main():
    print("=" * 70)
    print("Authority Magazine Cloud Deployment Secrets Exporter")
    print("=" * 70)
    print("Copy and paste these values into your Cloud Runner environment variables:")
    print("\nGeneral Settings:")
    print("  AUTHORITY_SAAS_URL=https://tli.authoritymag.co")
    print("  AUTHORITY_PITCH_BRIDGE_TOKEN=<Copy from https://tli.authoritymag.co/admin/automation>")
    print("  AUTHORITY_GENERIC_BRIDGE_TOKEN=<Copy from https://tli.authoritymag.co/admin/automation>")

    print("\n" + "=" * 70)
    print("Mailbox Secrets:")
    print("=" * 70)

    format_file_as_env("credentials.json", "GMAIL_CREDENTIALS_JSON", "GMAIL_CREDENTIALS_B64")
    format_file_as_env("token.json", "GMAIL_TOKEN_JSON", "GMAIL_TOKEN_B64")
    format_file_as_env("credentials_collab.json", "GMAIL_COLLAB_CREDENTIALS_JSON", "GMAIL_COLLAB_CREDENTIALS_B64")
    format_file_as_env("token_collab.json", "GMAIL_COLLAB_TOKEN_JSON", "GMAIL_COLLAB_TOKEN_B64")
    format_file_as_env("credentials_editor.json", "GMAIL_EDITOR_CREDENTIALS_JSON", "GMAIL_EDITOR_CREDENTIALS_B64")
    format_file_as_env("token_editor.json", "GMAIL_EDITOR_TOKEN_JSON", "GMAIL_EDITOR_TOKEN_B64")

    print("\n" + "=" * 70)


if __name__ == "__main__":
    main()
