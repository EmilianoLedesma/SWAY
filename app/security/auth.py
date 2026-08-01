import os
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

SECRET_KEY = os.getenv("JWT_SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("JWT_SECRET_KEY no está configurada — revisar .env")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 8

# HTTPBearer permite pegar el token directamente en el diálogo
# "Authorize" de Swagger (/docs) sin necesidad de un flujo OAuth2
bearer_scheme = HTTPBearer(auto_error=False)


def create_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido o expirado",
            headers={"WWW-Authenticate": "Bearer"},
        )


def _extract_token(credentials: Optional[HTTPAuthorizationCredentials]) -> Optional[str]:
    if credentials is None:
        return None
    return credentials.credentials


def get_current_tienda_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme)):
    token = _extract_token(credentials)
    if not token:
        raise HTTPException(status_code=401, detail="No autenticado")
    payload = decode_token(token)
    if payload.get("token_type") != "tienda":
        raise HTTPException(status_code=401, detail="Token de tipo incorrecto")
    return payload


def get_current_colaborador(credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme)):
    token = _extract_token(credentials)
    if not token:
        raise HTTPException(status_code=401, detail="No autenticado")
    payload = decode_token(token)
    if payload.get("token_type") != "colaborador":
        raise HTTPException(status_code=401, detail="Token de tipo incorrecto")
    return payload


def get_optional_organizador_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme)):
    token = _extract_token(credentials)
    if not token:
        return None
    try:
        payload = decode_token(token)
        if payload.get("token_type") in ("tienda", "colaborador"):
            return payload
        return None
    except HTTPException:
        return None
