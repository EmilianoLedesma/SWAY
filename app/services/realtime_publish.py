import json
import os

import redis

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379")
CHANNEL = "sway:events"

_client = None


def _get_client():
    global _client
    if _client is None:
        _client = redis.from_url(REDIS_URL)
    return _client


def publish_event(event_type: str, payload: dict) -> None:
    try:
        client = _get_client()
        client.publish(CHANNEL, json.dumps({"type": event_type, "payload": payload}))
    except Exception as e:
        print(f"[realtime] publish failed for {event_type}: {e}")
