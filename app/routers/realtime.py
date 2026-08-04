import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.realtime.manager import manager
from app.security.auth import decode_token

router = APIRouter(prefix="/api", tags=["realtime"])

AUTH_TIMEOUT_SECONDS = 10
ALLOWED_TOKEN_TYPES = ("colaborador",)


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()

    try:
        first_message = await asyncio.wait_for(websocket.receive_json(), timeout=AUTH_TIMEOUT_SECONDS)
    except Exception:
        await websocket.close(code=4001)
        return

    if first_message.get("type") != "auth" or not first_message.get("token"):
        await websocket.close(code=4001)
        return

    try:
        payload = decode_token(first_message["token"])
    except Exception:
        await websocket.close(code=4001)
        return

    if payload.get("token_type") not in ALLOWED_TOKEN_TYPES:
        await websocket.close(code=4001)
        return

    if not manager.connect(websocket):
        await websocket.close(code=1013)  # 1013 = "Try Again Later" (RFC 6455)
        return

    await websocket.send_json({"type": "auth_ok"})

    try:
        while True:
            await websocket.receive_text()  # no client heartbeat; connection relies on HAProxy's timeout tunnel 1h
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(websocket)
