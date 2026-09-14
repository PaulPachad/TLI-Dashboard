"""
Optional LLM-based verification for pitch matching.
Acts as an editorial second-opinion for ambiguous matches without blocking or breaking
offline/local operations.
"""

import os
import json
import logging
from typing import Optional, List, Dict, Any

logger = logging.getLogger(__name__)

class LLMArbiter:
    """Optional arbiter using Google Gemini to verify candidate topic matches."""
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or self._resolve_api_key()
        self.model = None
        self._init_model()

    def _resolve_api_key(self) -> Optional[str]:
        # Check environment variables
        env_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        if env_key:
            return env_key
        # Check settings.json
        base_dir = os.path.dirname(os.path.abspath(__file__))
        settings_path = os.path.join(base_dir, "settings.json")
        if os.path.exists(settings_path):
            try:
                with open(settings_path, "r", encoding="utf-8") as f:
                    cfg = json.load(f)
                    return cfg.get("gemini_api_key")
            except Exception:
                pass
        return None

    def _init_model(self):
        if not self.api_key:
            return
        try:
            import google.generativeai as genai
            genai.configure(api_key=self.api_key)
            self.model = genai.GenerativeModel("gemini-2.0-flash")
        except Exception as e:
            logger.debug(f"LLMArbiter initialization skipped: {e}")
            self.model = None

    def is_available(self) -> bool:
        return self.model is not None

    def verify_candidates(self, pitch_text: str, candidates: List[Any]) -> Optional[Dict[str, Any]]:
        """
        Ask the LLM to verify which candidate topic is the best fit for the pitch.
        
        Returns:
            Dict with {matched_series_id, confidence, reasoning} or None if inconclusive.
        """
        if not self.is_available() or not candidates:
            return None

        candidates_repr = "\n".join(
            f"- ID {getattr(c, 'series_id', c.get('series_id') if isinstance(c, dict) else '')}: "
            f"{getattr(c, 'name', c.get('name') if isinstance(c, dict) else '')} "
            f"(Initial Score: {getattr(c, 'score', c.get('score') if isinstance(c, dict) else '')}%)"
            for c in candidates[:5]
        )

        prompt = f"""You are an editorial triage assistant for Authority Magazine.
A submitter provided the following pitch topic and details:
--- PITCH DETAILS ---
{pitch_text}
---------------------

Here are the candidate interview series topics from our editorial catalog:
{candidates_repr}

Your task:
1. Determine which candidate interview series this pitch is genuinely intended for.
2. Carefully separate the umbrella series title from the interviewee's specific story angle or article subtitle.
3. If none of the candidates are a genuine match, return matched_series_id: null.

Respond ONLY with valid JSON in this exact structure:
{{
  "matched_series_id": <integer or null>,
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "reasoning": "<1-2 sentence explanation>"
}}
"""

        try:
            response = self.model.generate_content(
                prompt,
                generation_config={"response_mime_type": "application/json"}
            )
            data = json.loads(response.text.strip())
            matched_id = data.get("matched_series_id")
            confidence = data.get("confidence", "").upper()

            if matched_id is not None and confidence in ("HIGH", "MEDIUM"):
                logger.info(f"LLM Arbiter verified match -> Topic ID {matched_id} ({confidence}): {data.get('reasoning')}")
                return data
            return None
        except Exception as e:
            logger.debug(f"LLM Arbiter verification bypassed: {e}")
            return None
