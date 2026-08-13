import os

os.environ["PORTFOLIO_JWT_SECRET"] = "test-secret-key-for-tests-only"

from auth import create_token, decode_token, hash_password, verify_password  # noqa: E402
from fastapi import HTTPException
import pytest


def test_hash_and_verify_password_roundtrip():
    hashed = hash_password("correcthorse")
    assert verify_password("correcthorse", hashed) is True
    assert verify_password("wrongpassword", hashed) is False


def test_create_and_decode_token_roundtrip():
    token = create_token(42)
    payload = decode_token(token)
    assert payload["sub"] == "42"


def test_decode_token_rejects_garbage():
    with pytest.raises(HTTPException) as exc_info:
        decode_token("not-a-real-token")
    assert exc_info.value.status_code == 401
