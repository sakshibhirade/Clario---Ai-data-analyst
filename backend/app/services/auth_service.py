"""
Auth service: password hashing using direct bcrypt, JWT creation/decoding, reset token generation.
Direct bcrypt avoids passlib 1.7.4 compatibility bugs with modern bcrypt 4+.
"""
import os
import secrets
from datetime import datetime, timedelta
from typing import Optional

import bcrypt
from jose import JWTError, jwt

# ------------------------------------------------------------------
# Secret key: read from env or generate a persistent one
# ------------------------------------------------------------------
_SECRET_KEY: Optional[str] = None


def _get_secret_key() -> str:
    global _SECRET_KEY
    if _SECRET_KEY:
        return _SECRET_KEY

    # Read from env first
    key = os.environ.get("AUTH_SECRET_KEY", "")
    if key:
        _SECRET_KEY = key
        return _SECRET_KEY

    # Try to load from a local key file (same dir as this file)
    key_file = os.path.join(os.path.dirname(__file__), ".auth_secret_key")
    if os.path.exists(key_file):
        try:
            with open(key_file, "r") as f:
                key = f.read().strip()
            if key:
                _SECRET_KEY = key
                return _SECRET_KEY
        except Exception:
            pass

    # Generate a new key and persist it
    key = secrets.token_hex(32)
    try:
        with open(key_file, "w") as f:
            f.write(key)
    except Exception:
        pass  # If we can't write, just use it in-memory
    _SECRET_KEY = key
    return _SECRET_KEY


ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days


# ---------------------------------------------------------
# Password utilities with direct bcrypt
# ---------------------------------------------------------

def hash_password(plain_password: str) -> str:
    """Hash a plain-text password using direct bcrypt."""
    pwd_bytes = plain_password.encode("utf-8")[:72]
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain-text password against a bcrypt hash."""
    try:
        pwd_bytes = plain_password.encode("utf-8")[:72]
        hash_bytes = hashed_password.encode("utf-8")
        return bcrypt.checkpw(pwd_bytes, hash_bytes)
    except Exception:
        return False


# ---------------------------------------------------------
# JWT utilities
# ---------------------------------------------------------

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a signed JWT access token."""
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, _get_secret_key(), algorithm=ALGORITHM)


def decode_access_token(token: str) -> Optional[dict]:
    """Decode and validate a JWT token. Returns the payload or None on failure."""
    try:
        payload = jwt.decode(token, _get_secret_key(), algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None


# ---------------------------------------------------------
# Reset token
# ---------------------------------------------------------

def generate_reset_token() -> str:
    """Generate a URL-safe 32-byte reset token."""
    return secrets.token_urlsafe(32)
