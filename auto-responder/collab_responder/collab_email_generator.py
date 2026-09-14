"""
Collab Email Generator

Generates the short acceptance email sent to HARO/SOS/Qwoted sources
with the correct Google Form link.

Email template (as specified):

    Sure we'd love to include you in this series.
    Can you add your basic info in the form here?

    [Topic Name]
    [Form URL]

    After the pitches come in we will send you the interview questions.
    I look forward!
"""

import logging
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class CollabEmailDraft:
    """Generated email draft for the collaboration inbox."""
    subject: str
    body: str
    is_acceptance: bool


def safe_format(template_str: str, **kwargs) -> str:
    """Format template string without throwing KeyError on missing placeholders."""
    defaults = {"signature": "Yitzi"}
    defaults.update({k: v for k, v in kwargs.items() if v is not None})
    class SafeDict(dict):
        def __missing__(self, key):
            return "{" + key + "}"
    return template_str.format_map(SafeDict(defaults))


class CollabEmailGenerator:
    """
    Generates draft emails for responses to HARO/SOS/Qwoted pitches.
    """

    # -----------------------------------------------------------------------
    # Acceptance template  (source matched to a specific form)
    # -----------------------------------------------------------------------
    ACCEPTANCE_TEMPLATE = """\
Sure we'd love to include you in this series. \
Can you add your basic info in the form here?

{topic_name}
{form_url}

After the pitches come in we will send you the interview questions.
I look forward!

Yitzi"""

    # -----------------------------------------------------------------------
    # No-match fallback  (couldn't figure out which form to send)
    # -----------------------------------------------------------------------
    NO_MATCH_TEMPLATE = """\
Thank you for reaching out to Authority Magazine!

We'd love to consider you for one of our ongoing interview series. \
To make sure we connect you with the right series, could you share a \
bit more about your area of expertise or the topic you're pitching on?

Once we know more, we'll send you the correct submission form.

Looking forward to hearing from you!"""

    def generate_acceptance_email(
        self,
        topic_name: str,
        form_url: str,
        original_subject: str = "",
    ) -> CollabEmailDraft:
        """
        Generate the short acceptance email with the matched form link.

        Args:
            topic_name:  Display name of the matched topic/series.
            form_url:    Google Form URL to include in the email.
            original_subject: Subject line of the incoming pitch (used to build reply subject).

        Returns:
            CollabEmailDraft ready for use as a Gmail draft.
        """
        body = safe_format(
            self.ACCEPTANCE_TEMPLATE,
            topic_name=topic_name,
            form_url=form_url,
            series_name=topic_name,
            interview_link=form_url,
        )

        # Build a clean reply subject
        if original_subject:
            clean_subject = original_subject
            if not clean_subject.lower().startswith("re:"):
                clean_subject = f"Re: {clean_subject}"
        else:
            clean_subject = "Re: Your Pitch to Authority Magazine"

        return CollabEmailDraft(
            subject=clean_subject,
            body=body,
            is_acceptance=True,
        )

    def generate_no_match_email(
        self,
        original_subject: str = "",
    ) -> CollabEmailDraft:
        """
        Generate a fallback email asking the source to clarify their topic.

        Returns:
            CollabEmailDraft with the fallback template.
        """
        if original_subject:
            clean_subject = original_subject
            if not clean_subject.lower().startswith("re:"):
                clean_subject = f"Re: {clean_subject}"
        else:
            clean_subject = "Re: Your Pitch to Authority Magazine"

        return CollabEmailDraft(
            subject=clean_subject,
            body=safe_format(self.NO_MATCH_TEMPLATE),
            is_acceptance=False,
        )
