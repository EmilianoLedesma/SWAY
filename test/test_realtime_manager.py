import asyncio
from unittest.mock import AsyncMock

from app.realtime.manager import ConnectionManager


def test_broadcast_sends_to_all_connected():
    async def run():
        mgr = ConnectionManager()
        ws1 = AsyncMock()
        ws2 = AsyncMock()
        mgr.connect(ws1)
        mgr.connect(ws2)

        await mgr.broadcast({"type": "avistamiento_created", "payload": {"id": 1}})

        ws1.send_json.assert_awaited_once_with({"type": "avistamiento_created", "payload": {"id": 1}})
        ws2.send_json.assert_awaited_once_with({"type": "avistamiento_created", "payload": {"id": 1}})

    asyncio.run(run())


def test_broadcast_drops_dead_connections_without_raising():
    async def run():
        mgr = ConnectionManager()
        healthy = AsyncMock()
        dead = AsyncMock()
        dead.send_json.side_effect = Exception("connection closed")
        mgr.connect(healthy)
        mgr.connect(dead)

        await mgr.broadcast({"type": "evento_created", "payload": {}})  # must not raise

        assert dead not in mgr.active
        assert healthy in mgr.active

    asyncio.run(run())


def test_disconnect_removes_connection():
    mgr = ConnectionManager()
    ws = AsyncMock()
    mgr.connect(ws)
    mgr.disconnect(ws)
    assert ws not in mgr.active


def test_connect_rejects_past_the_cap():
    mgr = ConnectionManager(max_connections=2)
    ws1, ws2, ws3 = AsyncMock(), AsyncMock(), AsyncMock()
    assert mgr.connect(ws1) is True
    assert mgr.connect(ws2) is True
    assert mgr.connect(ws3) is False
    assert ws3 not in mgr.active
    assert len(mgr.active) == 2
