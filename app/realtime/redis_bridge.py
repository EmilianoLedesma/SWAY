import asyncio
import json
import os

import redis.asyncio as aioredis

from app.realtime.manager import manager

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379")
CHANNEL = "sway:events"


async def start_subscriber():
    while True:
        try:
            client = aioredis.from_url(REDIS_URL)
            pubsub = client.pubsub()
            await pubsub.subscribe(CHANNEL)
            async for message in pubsub.listen():
                if message["type"] != "message":
                    continue
                data = json.loads(message["data"])
                await manager.broadcast(data)
        except Exception as e:
            print(f"[realtime] subscriber error, retrying in 5s: {e}")
            await asyncio.sleep(5)
