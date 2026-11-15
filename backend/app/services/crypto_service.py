import base64
import hashlib
import json
import os
from pathlib import Path
from typing import Any, Dict
from cryptography.fernet import Fernet
from dotenv import load_dotenv

load_dotenv()

# Path for persistent default encryption key fallback if not in env
_KEY_FILE = Path(__file__).resolve().parent.parent.parent / ".encryption_key"


def _get_or_create_key() -> bytes:
    """Retrieve encryption key from env or persistent file, or generate a new one."""
    env_key = os.getenv("ENCRYPTION_KEY")
    if env_key:
        # If it's already a valid Fernet key (32 url-safe base64-encoded bytes)
        try:
            Fernet(env_key.encode())
            return env_key.encode()
        except Exception:
            # Hash into a 32-byte key
            derived = hashlib.sha256(env_key.encode()).digest()
            return base64.urlsafe_b64encode(derived)

    # Check for stored key file
    if _KEY_FILE.exists():
        try:
            stored = _KEY_FILE.read_text().strip().encode()
            Fernet(stored)
            return stored
        except Exception:
            pass

    # Generate a fresh Fernet key and persist to file
    new_key = Fernet.generate_key()
    try:
        _KEY_FILE.write_text(new_key.decode())
    except Exception:
        pass
    return new_key


_fernet = Fernet(_get_or_create_key())


def encrypt_credentials(data: Dict[str, Any]) -> str:
    """Encrypt a credentials dictionary to a secure token string."""
    raw = json.dumps(data).encode("utf-8")
    return _fernet.encrypt(raw).decode("utf-8")


def decrypt_credentials(token: str) -> Dict[str, Any]:
    """Decrypt a secure token string back to a credentials dictionary."""
    if not token:
        return {}
    raw = _fernet.decrypt(token.encode("utf-8"))
    return json.loads(raw.decode("utf-8"))
