import os
from fastapi import Header, HTTPException

_API_KEY = os.getenv("API_KEY")


def require_api_key(x_api_key: str | None = Header(default=None, alias="x-api-key")):
    if not _API_KEY:
        raise HTTPException(status_code=500, detail="API Key no configurada en el servidor")
    if x_api_key != _API_KEY:
        raise HTTPException(
            status_code=401,
            detail={"error": "No autorizado", "mensaje": "API Key inválida o no enviada"}
        )
    return True
