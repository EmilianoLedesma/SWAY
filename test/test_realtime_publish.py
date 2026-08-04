from unittest.mock import MagicMock, patch

from app.services import realtime_publish


def test_publish_event_calls_redis_publish_with_json():
    fake_client = MagicMock()
    with patch.object(realtime_publish, "_get_client", return_value=fake_client):
        realtime_publish.publish_event("avistamiento_created", {"id": 1})

    assert fake_client.publish.call_count == 1
    channel, message = fake_client.publish.call_args[0]
    assert channel == realtime_publish.CHANNEL
    assert '"type": "avistamiento_created"' in message or '"type":"avistamiento_created"' in message
    assert '"id": 1' in message or '"id":1' in message


def test_publish_event_does_not_raise_when_redis_unavailable():
    with patch.object(realtime_publish, "_get_client", side_effect=Exception("connection refused")):
        realtime_publish.publish_event("avistamiento_created", {"id": 1})  # must not raise
