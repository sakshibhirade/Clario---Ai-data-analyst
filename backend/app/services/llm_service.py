import os
from pathlib import Path
from dotenv import load_dotenv
from google import genai

_ENV_FILE = Path(__file__).resolve().parent.parent.parent / ".env"
if _ENV_FILE.exists():
    load_dotenv(dotenv_path=_ENV_FILE)
else:
    load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not GEMINI_API_KEY:
    raise ValueError("GEMINI_API_KEY is not set. Add it to backend/.env")

client = genai.Client(api_key=GEMINI_API_KEY)

# Override in backend/.env with GEMINI_MODEL=<model name> if needed.
MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")


class LLMError(Exception):
    """Raised when the language model call fails."""


def generate_text(prompt: str) -> str:
    try:
        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=prompt,
        )
    except Exception as e:
        raise LLMError(f"Gemini request failed ({MODEL_NAME}): {e}") from e

    text = response.text
    if not text:
        raise LLMError("Gemini returned an empty response.")
    return text
