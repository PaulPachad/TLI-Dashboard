"""
Authentication helper for the Authority Magazine Editor Mailbox (editor@authoritymag.co).
Opens a browser window for Google OAuth2 sign-in and generates token_editor.json.
"""
import os
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)

from gmail_client import GmailClient


def main():
    print("=" * 60)
    print("Authority Magazine - Editor Mailbox (editor@authoritymag.co) Auth")
    print("=" * 60)
    print("\nA browser window will open.")
    print("Please log into: editor@authoritymag.co")
    print("and grant Gmail permissions.\n")

    credentials_path = os.path.join(BASE_DIR, "credentials.json")
    token_path = os.path.join(BASE_DIR, "token_editor.json")

    client = GmailClient(credentials_path=credentials_path, token_path=token_path)
    client.authenticate(interactive=True)

    print("\n" + "=" * 60)
    print(f"SUCCESS! Authenticated as: {client.user_email}")
    print(f"Token saved to: {token_path}")
    print("=" * 60)
    print("\nNext step: Run 'python export_cloud_secrets.py' to export for Railway.")


if __name__ == "__main__":
    main()
