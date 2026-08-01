import os
from fastapi import HTTPException
from fastapi.security import APIKeyHeader

_API_KEY = os.getenv("API_KEY")

_api_key_header = APIKeyHeader(name="x-api-key", auto_error=False)


def require_api_key(x_api_key: str | None = _api_key_header):
    if not _API_KEY:
        raise HTTPException(status_code=500, detail="API Key no configurada en el servidor")
    if x_api_key != _API_KEY:
        raise HTTPException(
            status_code=401,
            detail={"error": "No autorizado", "mensaje": "API Key inválida o no enviada"}
        )
    return True
