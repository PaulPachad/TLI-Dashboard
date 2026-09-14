"""
Collab Gmail Client

A thin wrapper around the existing GmailClient that authenticates as
articlecollaborationteam@gmail.com using its own credentials/token files.

All the heavy lifting (OAuth flow, draft creation, message listing, etc.)
is inherited from the parent GmailClient class — we just point it at
different credential and token files.
"""

import os
import sys
import logging

# Ensure the parent directory is on the path so we can import GmailClient
_BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BASE_DIR not in sys.path:
    sys.path.insert(0, _BASE_DIR)

from gmail_client import GmailClient

logger = logging.getLogger(__name__)

# File names for the collaboration account's OAuth files.
# These live in the same directory as the main credentials.json / token.json.
COLLAB_CREDENTIALS_FILE = "credentials_collab.json"
COLLAB_TOKEN_FILE        = "token_collab.json"


class CollabGmailClient(GmailClient):
    """
    Gmail client pre-configured for articlecollaborationteam@gmail.com.

    On first use this will open a browser window for the user to authorise
    the collaboration Gmail account.  The resulting token is saved as
    token_collab.json and reused on subsequent runs.

    Setup checklist (see COLLAB_SETUP.md for full instructions):
      1. Copy credentials.json → credentials_collab.json
         (or create a new OAuth client in Google Cloud Console)
      2. Add articlecollaborationteam@gmail.com as a test user in the
         Google Cloud Console OAuth consent screen (if the app is in
         'Testing' mode).
      3. Run the tray app — a browser window will open for authorisation.
         Complete the flow and the token_collab.json file will be saved.
    """

    def __init__(self):
        base_dir = _BASE_DIR
        credentials_path = os.path.join(base_dir, COLLAB_CREDENTIALS_FILE)
        token_path       = os.path.join(base_dir, COLLAB_TOKEN_FILE)

        super().__init__(
            credentials_path=credentials_path,
            token_path=token_path,
        )

        logger.info(
            f"[CollabGmailClient] Initialised — credentials: {COLLAB_CREDENTIALS_FILE}, "
            f"token: {COLLAB_TOKEN_FILE}"
        )

    def is_configured(self) -> bool:
        """
        Check if the collab credentials file exists.

        Returns False (and logs a helpful message) if the credentials file
        has not yet been copied / created.
        """
        if not os.path.exists(self.credentials_path):
            logger.error(
                f"[CollabGmailClient] Credentials file not found: {self.credentials_path}\n"
                "Please copy credentials.json → credentials_collab.json\n"
                "and follow the steps in COLLAB_SETUP.md."
            )
            return False
        return True
