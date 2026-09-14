"""
Email template generator for pitch acceptance responses.
Generates acceptance emails with the correct interview questions link,
or fallback emails when no topic match is found.
"""

import os
import json
from typing import Optional
from dataclasses import dataclass


def load_email_config():
    """Load email templates from config file if it exists."""
    config_path = os.path.join(os.path.dirname(__file__), 'email_config.json')
    if os.path.exists(config_path):
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except:
            pass
    return None


@dataclass
class EmailDraft:
    """Generated email draft."""
    subject: str
    body: str
    is_acceptance: bool


class EmailGenerator:
    """Generates email drafts for pitch responses."""
    
    # Template for accepted pitches
    ACCEPTANCE_TEMPLATE = """Thank you so much for your pitch to Authority Magazine. 

You have been accepted and we would like to move forward with an email interview. 

Here is the link for the email interview questions for this series:

{series_name}
{interview_link}


Please complete the written interview, (please do not use AI to create your answers) and upload the interview, images and bio into the portal linked at the bottom of the interview when it is complete.

When you upload the material, please keep your browser open until you see a confirmation message.

The official deadline is 21 days.
 
After you upload the interview in the writer's portal, you will see a link to a spreadsheet queue with our estimated publishing dates.
 
All other details and frequently asked questions are addressed here: https://bit.ly/AuthorityMagFAQandInstructions   
 
We look forward to seeing your interview submission!
 
Warmly,
Yitzi"""

    # Template when no topic match is found
    NO_MATCH_TEMPLATE = """Hi there!

Thank you for your interest in Authority Magazine.

Can you please choose one of our ongoing interview series topics from our list here:
[📚 Browse Ongoing Interview Series](https://medium.com/authority-magazine/ongoing-interview-series-in-authority-magazine-7d633a349753)

If you'd like help finding the best match, you can ask our AI Bot here:
[🤖 Ask Authority Magazine AI Bot](https://chatgpt.com/g/g-DOnEg59Sc-authority-magazine-bot)

Once you've selected a topic that fits your expertise, please submit your selection in our pitch form here:
[📝 Submit Pitch Form](https://docs.google.com/forms/d/e/1FAIpQLSdkUiiJpgE53-I6pDQOm-zWveNeCXkGFonoVX5ULmN0dPsfxA/viewform)

Best regards,
Authority Magazine Editorial Team"""



    # Template when multiple matches - provide links for both, let them choose
    MULTIPLE_MATCH_TEMPLATE = """Thank you so much for your pitch to Authority Magazine. 

You have been accepted and we would like to move forward with an email interview. 

Based on your pitch, here is the interview series that fits your expertise. Please click the link below to get started:

{series_list}

Please complete the written interview, (please do not use AI to create your answers) and upload the interview, images and bio into the portal linked at the bottom of the interview when it is complete.

When you upload the material, please keep your browser open until you see a confirmation message.

The official deadline is 21 days.
 
After you upload the interview in the writer's portal, you will see a link to a spreadsheet queue with our estimated publishing dates.
 
All other details and frequently asked questions are addressed here: https://bit.ly/AuthorityMagFAQandInstructions   
 
We look forward to seeing your interview submission!
 
Warmly,
Yitzi"""

    # Template for extension requests
    EXTENSION_TEMPLATE = """Sure! :-)"""

    def __init__(self):
        # Load custom templates from config if available
        config = load_email_config()
        if config:
            if 'acceptance_template' in config:
                self.ACCEPTANCE_TEMPLATE = config['acceptance_template']
            if 'no_match_template' in config:
                self.NO_MATCH_TEMPLATE = config['no_match_template']

    
    def generate_acceptance_email(
        self,
        series_name: str,
        interview_link: str,
        interviewee_name: Optional[str] = None,
        review_note: Optional[str] = None
    ) -> EmailDraft:
        """
        Generate an acceptance email with the interview questions link.
        
        Args:
            series_name: Name of the interview series
            interview_link: Link to the interview questions
            interviewee_name: Optional name of the person being interviewed
            review_note: Optional editorial review banner prepended to the draft body
            
        Returns:
            EmailDraft with subject and body
        """
        body = self.ACCEPTANCE_TEMPLATE.format(
            series_name=series_name,
            interview_link=interview_link
        )
        if review_note:
            body = f"{review_note}\n\n{body}"
        
        subject = f"Authority Magazine - {series_name} Interview Invitation"
        
        return EmailDraft(
            subject=subject,
            body=body,
            is_acceptance=True
        )
    
    def generate_no_match_email(self) -> EmailDraft:
        """
        Generate an email asking the sender to choose a topic.
        
        Returns:
            EmailDraft with subject and body
        """
        return EmailDraft(
            subject="Authority Magazine - Please Select an Interview Series",
            body=self.NO_MATCH_TEMPLATE,
            is_acceptance=False
        )
    

    
    def generate_multiple_match_email(self, matches: list) -> EmailDraft:
        """
        Generate an email listing multiple possible series matches with links.
        
        Args:
            matches: List of match results with name, link, category, and score
            
        Returns:
            EmailDraft with subject and body containing clickable links
        """
        series_lines = []
        for i, match in enumerate(matches, 1):
            # Include the link so they can click directly
            series_lines.append(f"{i}. {match.name}\n   {match.link}")
        
        series_list = "\n\n".join(series_lines)
        
        body = self.MULTIPLE_MATCH_TEMPLATE.format(series_list=series_list)
        
        return EmailDraft(
            subject="Authority Magazine - Interview Invitation",
            body=body,
            is_acceptance=True  # This is an acceptance, just with options
        )


    def generate_extension_email(self) -> EmailDraft:
        """
        Generate an email in response to a deadline extension request.
        
        Returns:
            EmailDraft object designed for extension requests
        """
        return EmailDraft(
            subject="Authority Magazine - Extension", # This gets replaced in auto_responder
            body=self.EXTENSION_TEMPLATE,
            is_acceptance=True
        )

# Quick test
if __name__ == "__main__":
    generator = EmailGenerator()
    
    # Test acceptance email
    print("=" * 50)
    print("ACCEPTANCE EMAIL:")
    print("=" * 50)
    email = generator.generate_acceptance_email(
        series_name="Women In Wellness",
        interview_link="https://docs.google.com/document/d/example123"
    )
    print(f"Subject: {email.subject}")
    print(f"\n{email.body}")
    
    # Test no-match email
    print("\n" + "=" * 50)
    print("NO MATCH EMAIL:")
    print("=" * 50)
    email = generator.generate_no_match_email()
    print(f"Subject: {email.subject}")
    print(f"\n{email.body}")
