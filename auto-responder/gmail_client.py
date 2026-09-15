"""
Gmail API client for creating email drafts.
Uses OAuth2 to authenticate with Google and create drafts in the user's Gmail.
"""

import os
import base64
import ssl
import socket
import time
import functools
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional
import json

# ── SSL FIX for Python 3.14 on Windows ────────────────────────────────────────
# truststore injects the Windows system certificate store into Python's ssl
# module at a low level, fixing CERTIFICATE_VERIFY_FAILED for ALL https
# connections including the google-auth-oauthlib internal HTTP client.
try:
    import truststore
    truststore.inject_into_ssl()
except ImportError:
    # Fallback: use certifi CA bundle via env vars
    import certifi
    os.environ['SSL_CERT_FILE'] = certifi.where()
    os.environ['REQUESTS_CA_BUNDLE'] = certifi.where()
# ──────────────────────────────────────────────────────────────────────────────

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError


# If modifying these scopes, delete the file token.json.
SCOPES = ['https://www.googleapis.com/auth/gmail.modify']

# Configure logger for this module
logger = logging.getLogger(__name__)


def retry_on_transient_error(max_retries=3, base_delay=1.0):
    """
    Decorator that retries a function on transient SSL/network errors.
    
    Uses exponential backoff: delay = base_delay * 2^attempt
    Handles SSL errors, connection resets, timeouts, and temporary HTTP errors.
    """
    # Transient error messages that warrant retry
    TRANSIENT_PATTERNS = [
        'DECRYPTION_FAILED_OR_BAD_RECORD_MAC',
        'WRONG_VERSION_NUMBER',
        'CONNECTION_RESET',
        'ECONNRESET',
        'Connection reset',
        'Connection refused',
        'timed out',
        'Temporary failure',
        'Service Unavailable',
        'Bad Gateway',
        'WinError 10053',
        '10053',
        'established connection was aborted',
    ]
    
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            last_exception = None
            
            # Helper to reset service if possible
            def reset_service_connection():
                if args and hasattr(args[0], 'service'):
                    logger.info("  Resetting Gmail service connection due to SSL/Network error...")
                    args[0].service = None

            for attempt in range(max_retries + 1):
                try:
                    return func(*args, **kwargs)
                    
                except ssl.SSLError as e:
                    last_exception = e
                    if attempt < max_retries:
                        reset_service_connection()
                        delay = base_delay * (2 ** attempt)
                        logger.warning(f"SSL error on attempt {attempt + 1}/{max_retries + 1}: {e}. Retrying in {delay}s...")
                        time.sleep(delay)
                    else:
                        logger.error(f"SSL error after {max_retries + 1} attempts: {e}")
                        raise
                        
                except socket.error as e:
                    last_exception = e
                    if attempt < max_retries:
                        reset_service_connection()
                        delay = base_delay * (2 ** attempt)
                        logger.warning(f"Socket error on attempt {attempt + 1}/{max_retries + 1}: {e}. Retrying in {delay}s...")
                        time.sleep(delay)
                    else:
                        logger.error(f"Socket error after {max_retries + 1} attempts: {e}")
                        raise
                        
                except HttpError as e:
                    # Only retry on 5xx server errors (temporary)
                    if e.resp.status >= 500 and attempt < max_retries:
                        delay = base_delay * (2 ** attempt)
                        logger.warning(f"HTTP {e.resp.status} on attempt {attempt + 1}/{max_retries + 1}. Retrying in {delay}s...")
                        time.sleep(delay)
                        last_exception = e
                    else:
                        raise
                        
                except Exception as e:
                    error_str = str(e)
                    is_transient = any(pattern.lower() in error_str.lower() for pattern in TRANSIENT_PATTERNS)
                    
                    if is_transient and attempt < max_retries:
                        reset_service_connection()
                        delay = base_delay * (2 ** attempt)
                        logger.warning(f"Transient error on attempt {attempt + 1}/{max_retries + 1}: {e}. Retrying in {delay}s...")
                        time.sleep(delay)
                        last_exception = e
                    else:
                        raise
            
            # Should not reach here, but just in case
            if last_exception:
                raise last_exception
                
        return wrapper
    return decorator


class InteractionRequiredError(Exception):
    """Exception raised when authentication requires user interaction but it's not allowed."""
    pass


class GmailClient:
    """Gmail API client for creating drafts and reading emails."""
    
    def __init__(self, credentials_path: str = None, token_path: str = None):
        """
        Initialize the Gmail client.
        
        Args:
            credentials_path: Path to the OAuth credentials JSON file (from Google Cloud Console)
            token_path: Path to store the user's access token
        """
        base_dir = os.path.dirname(os.path.abspath(__file__))
        
        self.credentials_path = credentials_path or os.path.join(base_dir, "credentials.json")
        self.token_path = token_path or os.path.join(base_dir, "token.json")
        self.service = None
        self.user_email = None
        
        # Interaction flag - set to True when authentication fails in non-interactive mode
        self.interaction_required = False
        
        # Draft thread ID cache - avoid fetching all drafts on every poll
        self._draft_thread_cache = set()   # set of thread_ids that have drafts
        self._draft_cache_time = 0.0        # epoch seconds when cache was filled
        self._DRAFT_CACHE_TTL = 60.0        # seconds before cache expires
    
    def is_configured(self) -> bool:
        """Check if credentials file exists."""
        return os.path.exists(self.credentials_path)
    
    def is_authenticated(self) -> bool:
        """Check if we have valid authentication."""
        if not os.path.exists(self.token_path):
            return False
        
        try:
            creds = Credentials.from_authorized_user_file(self.token_path, SCOPES)
            return creds and creds.valid
        except:
            return False
    
    def authenticate(self, interactive: bool = True) -> bool:
        """
        Authenticate with Gmail API using OAuth2.
        
        Args:
            interactive: If True, will open a browser window for user to grant access if needed.
                         If False, will raise InteractionRequiredError if interaction is needed.
        
        Returns:
            True if authentication was successful
        
        Raises:
            InteractionRequiredError: If interactive is False but interaction is needed.
        """
        creds = None
        self.interaction_required = False
        
        # Check for existing token
        if os.path.exists(self.token_path):
            try:
                creds = Credentials.from_authorized_user_file(self.token_path, SCOPES)
            except Exception as e:
                logger.error(f"Error loading token: {e}")
                creds = None
        
        # If no valid credentials, get new ones
        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                try:
                    import requests
                    from requests.adapters import HTTPAdapter
                    from urllib3.util.retry import Retry
                    
                    retry_strategy = Retry(
                        total=5,
                        backoff_factor=1,
                        status_forcelist=[500, 502, 503, 504],
                        allowed_methods=["POST", "GET"]
                    )
                    session = requests.Session()
                    adapter = HTTPAdapter(max_retries=retry_strategy)
                    session.mount("https://", adapter)
                    session.mount("http://", adapter)
                    
                    creds.refresh(Request(session=session))
                except Exception as e:
                    import google.auth.exceptions
                    if isinstance(e, google.auth.exceptions.RefreshError) or 'invalid_grant' in str(e).lower():
                        logger.warning(f"Refresh token invalid or revoked: {e}")
                        creds = None
                    else:
                        logger.warning(f"Network error while refreshing token: {e}")
                        raise  # Let network errors bubble up, do NOT delete the token
            
            if not creds:
                if not interactive:
                    self.interaction_required = True
                    raise InteractionRequiredError("Gmail authentication required. Please authorize via the tray menu.")
                
                if not os.path.exists(self.credentials_path):
                    raise FileNotFoundError(
                        f"Credentials file not found: {self.credentials_path}\n"
                        "Please download credentials.json from Google Cloud Console."
                    )
                
                # Delete old token if scopes changed
                if os.path.exists(self.token_path):
                    try:
                        os.remove(self.token_path)
                    except:
                        pass
                
                logger.info("Opening browser for Gmail authentication...")
                flow = InstalledAppFlow.from_client_secrets_file(
                    self.credentials_path, SCOPES
                )
                
                # --- TechLoq proxy mitigation ---
                # Add retry strategy to the internal OAuth session so the token exchange 
                # request doesn't instantly die on transient connection resets intercepting it.
                from requests.adapters import HTTPAdapter
                from urllib3.util.retry import Retry
                
                retry_strategy = Retry(
                    total=5,
                    backoff_factor=1,
                    status_forcelist=[500, 502, 503, 504],
                    allowed_methods=["POST", "GET"]
                )
                adapter = HTTPAdapter(max_retries=retry_strategy)
                flow.oauth2session.mount("https://", adapter)
                flow.oauth2session.mount("http://", adapter)
                
                creds = flow.run_local_server(port=0)
            
            # Save credentials for next run
            with open(self.token_path, 'w') as token:
                token.write(creds.to_json())
        
        # Build the Gmail service
        self.service = build('gmail', 'v1', credentials=creds)
        
        # Get user's email address
        try:
            profile = self.service.users().getProfile(userId='me').execute()
            self.user_email = profile.get('emailAddress')
        except HttpError:
            self.user_email = None
        
        return True
    
    @retry_on_transient_error()
    def thread_has_draft(self, thread_id: str) -> bool:
        """
        Check if a thread already has a draft.
        Uses a 60-second cache to avoid hammering the API on every poll cycle.
        """
        if not self.service:
            if not self.authenticate(interactive=False):
                return False
        
        # Refresh cache if stale
        if time.time() - self._draft_cache_time > self._DRAFT_CACHE_TTL:
            try:
                new_cache = set()
                result = self.service.users().drafts().list(userId='me').execute()
                drafts = result.get('drafts', [])
                
                for draft in drafts:
                    draft_detail = self.service.users().drafts().get(
                        userId='me', id=draft['id']
                    ).execute()
                    t = draft_detail.get('message', {}).get('threadId')
                    if t:
                        new_cache.add(t)
                
                self._draft_thread_cache = new_cache
                self._draft_cache_time = time.time()
                
            except HttpError:
                # On error, return safe default (False = don't skip processing)
                return False
        
        return thread_id in self._draft_thread_cache
    
    def invalidate_draft_cache(self):
        """Force the draft cache to refresh on next call (call after creating a draft)."""
        self._draft_cache_time = 0.0
    
    @retry_on_transient_error()
    def list_messages(self, query: str = 'subject:pitch', max_results: int = 10) -> list:
        """
        List messages matching the query.
        
        Args:
            query: Gmail search query (e.g., 'subject:pitch is:unread')
            max_results: Max number of emails to fetch
            
        Returns:
            List of message dicts (id, threadId, snippet, internalDate)
        """
        if not self.service:
            if not self.authenticate(interactive=False):
                return []
        
        try:
            results = self.service.users().messages().list(
                userId='me', q=query, maxResults=max_results
            ).execute()
            messages = results.get('messages', [])
            
            # Fetch details for snippets/subjects
            detailed_messages = []
            for msg in messages:
                details = self.service.users().messages().get(
                    userId='me', id=msg['id'], format='metadata', 
                    metadataHeaders=['Subject', 'From', 'Date', 'Reply-To']
                ).execute()
                
                # Extract headers
                headers = details.get('payload', {}).get('headers', [])
                subject = next((h['value'] for h in headers if h['name'] == 'Subject'), '(No Subject)')
                sender = next((h['value'] for h in headers if h['name'] == 'From'), '(Unknown)')
                date = next((h['value'] for h in headers if h['name'] == 'Date'), '')
                reply_to = next((h['value'] for h in headers if h['name'].lower() == 'reply-to'), None)
                
                detailed_messages.append({
                    'id': msg['id'],
                    'snippet': details.get('snippet', ''),
                    'subject': subject,
                    'sender': sender,
                    'date': date,
                    'reply_to': reply_to
                })
                
            return detailed_messages
            
        except HttpError as error:
            print(f"An error occurred: {error}")
            return []

    @retry_on_transient_error()
    def get_message_content(self, message_id: str) -> Optional[str]:
        """
        Get the full text content of a message.
        Handles nested multipart messages.
        """
        if not self.service:
            if not self.authenticate(interactive=False):
                return None
                
        try:
            message = self.service.users().messages().get(
                userId='me', id=message_id, format='full'
            ).execute()
            
            payload = message.get('payload', {})
            
            # Recursively extract text from payload
            def extract_text(part):
                """Recursively extract plain text from message parts."""
                mime_type = part.get('mimeType', '')
                body = part.get('body', {})
                parts = part.get('parts', [])
                
                # If this part is plain text, decode and return it
                if mime_type == 'text/plain':
                    data = body.get('data', '')
                    if data:
                        return base64.urlsafe_b64decode(data).decode('utf-8', errors='ignore')
                
                # If multipart, recurse into parts
                if parts:
                    for subpart in parts:
                        text = extract_text(subpart)
                        if text:
                            return text
                
                # Fallback: if body has data and no parts, try to decode
                if not parts and body.get('data'):
                    try:
                        return base64.urlsafe_b64decode(body['data']).decode('utf-8', errors='ignore')
                    except:
                        pass
                
                return None
            
            text = extract_text(payload)
            return text if text else ""
            
        except Exception as e:
            print(f"Error fetching message content: {e}")
    @staticmethod
    def _format_html_body(text: str) -> str:
        """Convert text with Markdown links and URLs to styled HTML with buttons and links."""
        import re
        
        lines = text.split('\n')
        processed_lines = []
        
        for line in lines:
            stripped = line.strip()
            # Check if the line is a standalone markdown link: [Button Label](https://...)
            standalone_match = re.fullmatch(r'\[([^\]]+)\]\((https?://[^\)]+)\)', stripped)
            if standalone_match:
                label = standalone_match.group(1).strip()
                url = standalone_match.group(2).strip()
                button_html = (
                    f'<table cellspacing="0" cellpadding="0" border="0" style="margin: 6px 0 8px 0;">'
                    f'<tr><td style="border-radius: 6px; background: #0071e3; text-align: center;">'
                    f'<a href="{url}" target="_blank" style="background: #0071e3; border: 1px solid #0071e3; '
                    f'font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, Arial, sans-serif; font-size: 13px; '
                    f'line-height: 1.2; font-weight: 500; text-decoration: none; padding: 9px 18px; color: #ffffff !important; '
                    f'display: inline-block; border-radius: 6px;">{label}</a>'
                    f'</td></tr></table>'
                )
                processed_lines.append(button_html)
            else:
                # Inline markdown links: [Text](URL) -> <a href="URL">Text</a>
                def replace_inline_md(m):
                    lbl, u = m.group(1), m.group(2)
                    return f'<a href="{u}" target="_blank" style="color: #0071e3; font-weight: 500; text-decoration: underline;">{lbl}</a>'
                
                line_html = re.sub(r'\[([^\]]+)\]\((https?://[^\)]+)\)', replace_inline_md, line)
                
                # Raw URLs that aren't inside href
                url_pattern = r'(?<!href=")(?<!">)(https?://[^\s<]+)'
                line_html = re.sub(url_pattern, r'<a href="\1" target="_blank" style="color: #0071e3; text-decoration: underline;">\1</a>', line_html)
                
                processed_lines.append(line_html + '<br>')
                
        html_content = '\n'.join(processed_lines)
        return (
            f'<html><body style="font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, Arial, sans-serif; '
            f'font-size: 14px; line-height: 1.5; color: #1d1d1f;">'
            f'{html_content}'
            f'</body></html>'
        )

    @staticmethod
    def _format_plain_body(text: str) -> str:
        """Ensure plain text version is cleanly readable without raw markdown brackets."""
        import re
        lines = text.split('\n')
        processed = []
        for line in lines:
            stripped = line.strip()
            m = re.fullmatch(r'\[([^\]]+)\]\((https?://[^\)]+)\)', stripped)
            if m:
                processed.append(f"{m.group(1)}: {m.group(2)}")
            else:
                processed.append(re.sub(r'\[([^\]]+)\]\((https?://[^\)]+)\)', r'\1 (\2)', line))
        return '\n'.join(processed)

    @retry_on_transient_error()
    def create_draft(
        self,
        to: str,
        subject: str,
        body: str,
        reply_to: str = None,
        thread_id: str = None,
        message_id: str = None
    ) -> Optional[dict]:
        """
        Create a draft email in the user's Gmail.
        
        Args:
            to: Recipient email address
            subject: Email subject
            body: Email body (plain text)
            reply_to: Optional email to set as reply-to
            thread_id: Optional thread ID to attach draft to (for replies)
            message_id: Optional Message-ID of email being replied to (for threading)
            
        Returns:
            Draft object if successful, None otherwise
        """
        if not self.service:
            if not self.authenticate(interactive=False):
                return None
        
        try:
            # Create the message
            message = MIMEMultipart('alternative')
            message['to'] = to
            message['subject'] = subject
            
            if reply_to:
                message['reply-to'] = reply_to
            
            # Add threading headers if replying
            if message_id:
                message['In-Reply-To'] = message_id
                message['References'] = message_id
            
            # Convert body to styled HTML with button / hyperlink support
            html_body = self._format_html_body(body)
            plain_body = self._format_plain_body(body)
            
            # Attach both plain text and HTML versions
            message.attach(MIMEText(plain_body, 'plain'))
            message.attach(MIMEText(html_body, 'html'))
            
            # Encode the message
            raw_message = base64.urlsafe_b64encode(message.as_bytes()).decode('utf-8')
            
            # Build draft body
            draft_body = {'message': {'raw': raw_message}}
            
            # Attach to thread if specified
            if thread_id:
                draft_body['message']['threadId'] = thread_id
            
            # Create the draft
            draft = self.service.users().drafts().create(
                userId='me',
                body=draft_body
            ).execute()
            
            if draft and thread_id:
                self._draft_thread_cache.add(thread_id)
            self.invalidate_draft_cache()
            
            return draft
            
        except HttpError as error:
            print(f"Gmail API error: {error}")
            return None
        except Exception as e:
            print(f"Error creating draft: {e}")
            return None

    @retry_on_transient_error()
    def send_email(self, to: str, subject: str, body: str) -> Optional[dict]:
        """
        Send an email directly (not as a draft).
        
        Used for system alerts (e.g. worker crash notifications).
        Requires gmail.modify or gmail.send scope.
        
        Args:
            to: Recipient email address
            subject: Email subject
            body: Email body (plain text)
            
        Returns:
            Sent message object if successful, None otherwise
        """
        if not self.service:
            if not self.authenticate(interactive=False):
                return None
        
        try:
            message = MIMEText(body, 'plain')
            message['to'] = to
            message['from'] = self.user_email or 'me'
            message['subject'] = subject
            
            raw_message = base64.urlsafe_b64encode(message.as_bytes()).decode('utf-8')
            
            sent = self.service.users().messages().send(
                userId='me',
                body={'raw': raw_message}
            ).execute()
            
            print(f"Alert email sent to {to}: {subject}")
            return sent
            
        except Exception as e:
            print(f"Error sending email to {to}: {e}")
            return None

    @retry_on_transient_error()
    def delete_draft(self, draft_id: str) -> bool:
        """
        Delete a draft by draft ID.
        
        Args:
            draft_id: Gmail draft ID to delete
            
        Returns:
            True if deleted successfully, False otherwise
        """
        if not self.service:
            if not self.authenticate(interactive=False):
                return False
        try:
            self.service.users().drafts().delete(userId='me', id=draft_id).execute()
            self.invalidate_draft_cache()
            return True
        except HttpError as error:
            print(f"Gmail API error deleting draft {draft_id}: {error}")
            return False
        except Exception as e:
            print(f"Error deleting draft {draft_id}: {e}")
            return False
    
    @retry_on_transient_error()
    def get_message_details(self, message_id: str) -> Optional[dict]:
        """
        Get message details including threadId and Message-ID header.
        """
        if not self.service:
            if not self.authenticate(interactive=False):
                return None
        
        try:
            message = self.service.users().messages().get(
                userId='me', id=message_id, format='metadata',
                metadataHeaders=['Message-ID', 'Subject', 'From', 'Reply-To']
            ).execute()
            
            headers = message.get('payload', {}).get('headers', [])
            msg_id_header = next((h['value'] for h in headers if h['name'] == 'Message-ID'), None)
            reply_to_header = next((h['value'] for h in headers if h['name'].lower() == 'reply-to'), None)
            
            return {
                'threadId': message.get('threadId'),
                'messageIdHeader': msg_id_header,
                'replyTo': reply_to_header
            }
        except Exception as e:
            print(f"Error getting message details: {e}")
            return None
    
    @retry_on_transient_error()
    def mark_as_read(self, message_id: str) -> bool:
        """
        Mark a message as read by removing the UNREAD label.
        
        Args:
            message_id: Gmail message ID to mark as read
            
        Returns:
            True if successful, False otherwise
        """
        if not self.service:
            if not self.authenticate(interactive=False):
                return False
        
        try:
            self.service.users().messages().modify(
                userId='me',
                id=message_id,
                body={'removeLabelIds': ['UNREAD']}
            ).execute()
            return True
        except HttpError as error:
            logger.error(f"Error marking message as read: {error}")
            return False
        except Exception as e:
            logger.error(f"Error marking message as read: {e}")
            return False
    
    def get_user_email(self) -> Optional[str]:
        """Get the authenticated user's email address."""
        return self.user_email


# Quick test
if __name__ == "__main__":
    client = GmailClient()
    
    print("Gmail Client Test")
    print("=" * 50)
    
    if not client.is_configured():
        print("ERROR: credentials.json not found!")
        print("\nTo set up Gmail integration:")
        print("1. Go to https://console.cloud.google.com/")
        print("2. Create a new project (or select existing)")
        print("3. Enable the Gmail API")
        print("4. Go to Credentials > Create Credentials > OAuth client ID")
        print("5. Choose 'Desktop app'")
        print("6. Download the JSON and save as 'credentials.json' in this folder")
    else:
        print("Credentials file found. Attempting authentication...")
        try:
            client.authenticate()
            print(f"Authenticated as: {client.user_email}")
            
            # Test creating a draft
            print("\nCreating test draft...")
            draft = client.create_draft(
                to="test@example.com",
                subject="Test Draft from Authority Magazine Tool",
                body="This is a test draft created by the Pitch Acceptance Tool."
            )
            
            if draft:
                print(f"Draft created successfully! ID: {draft['id']}")
            else:
                print("Failed to create draft")
                
        except Exception as e:
            print(f"Authentication failed: {e}")
