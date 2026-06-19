"""Snapshot encryption + PIN hashing.

Snapshots are stored server-side keyed by a salted PIN hash, with the JSON payload
encrypted at rest via Fernet (symmetric). The PIN is never stored in plaintext, and
the payload is unreadable without SNAPSHOT_ENCRYPTION_KEY.
"""

import hashlib
import hmac
import json

from cryptography.fernet import Fernet

from config import settings

# A fixed application salt for the PIN hash. The PIN is low-entropy by nature; this is
# a lookup key, not a password vault. Encryption of the payload is the real protection.
_PIN_SALT = b"rebalancer-pin-v1"


def _fernet() -> Fernet:
    key = settings.SNAPSHOT_ENCRYPTION_KEY
    if not key:
        raise RuntimeError(
            "SNAPSHOT_ENCRYPTION_KEY is not set - cannot encrypt/decrypt snapshots. "
            "Generate one with: python -c \"from cryptography.fernet import Fernet; "
            "print(Fernet.generate_key().decode())\""
        )
    return Fernet(key.encode() if isinstance(key, str) else key)


def hash_pin(pin: str) -> str:
    """Deterministic salted hash of the PIN, used as the lookup key."""
    return hmac.new(_PIN_SALT, pin.encode("utf-8"), hashlib.sha256).hexdigest()


def encrypt_payload(payload: dict) -> str:
    """Encrypt a JSON-serializable payload to a token string."""
    raw = json.dumps(payload).encode("utf-8")
    return _fernet().encrypt(raw).decode("utf-8")


def decrypt_payload(token: str) -> dict:
    """Decrypt a token string back to the original dict."""
    raw = _fernet().decrypt(token.encode("utf-8"))
    return json.loads(raw.decode("utf-8"))
