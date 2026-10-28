
import logging
import time

from google import genai
from google.genai import errors

from app.core.config import settings

logger = logging.getLogger(__name__)

MODEL_NAME = "gemini-flash-latest"
MAX_ATTEMPTS = 3
RETRYABLE_STATUS_CODES = (500, 502, 503, 504)


def generate_ai_response(prompt: str) -> str:
    """Generate a response using Gemini with retries for temporary failures."""

    if not prompt or not prompt.strip():
        raise ValueError("Prompt cannot be empty.")

    api_key = settings.LLM_API_KEY

    if not api_key or not api_key.strip():
        raise RuntimeError("Gemini API key is not configured.")

    client = genai.Client(api_key=api_key)

    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            response = client.models.generate_content(
                model=MODEL_NAME,
                contents=prompt.strip(),
            )

            answer = response.text

            if not answer or not answer.strip():
                raise RuntimeError("Gemini returned an empty response.")

            return answer.strip()

        except errors.ServerError as exc:
            if (
                attempt == MAX_ATTEMPTS
                or exc.code not in RETRYABLE_STATUS_CODES
            ):
                logger.exception("Gemini server request failed.")
                raise

            delay = 2 ** attempt
            logger.warning(
                "Gemini temporarily unavailable. "
                "Retry %s/%s in %s seconds.",
                attempt,
                MAX_ATTEMPTS,
                delay,
            )
            time.sleep(delay)

        except Exception:
            logger.exception("Gemini API request failed.")
            raise

    raise RuntimeError("Gemini request failed after retries.")

