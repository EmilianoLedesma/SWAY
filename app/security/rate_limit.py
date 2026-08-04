import os
from slowapi import Limiter
from slowapi.util import get_remote_address

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379")


def get_real_client_ip(request):
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return get_remote_address(request)


# storage_uri=memory:// keeps each api1/api2 replica's counter separate — the
# effective limit doubles silently since neither replica ever sees the other's
# requests. Redis gives both replicas one shared counter. in_memory_fallback
# degrades to today's per-process behavior (not zero protection) if Redis is
# unreachable, instead of 500ing every request — swallow_errors was tried
# first but hits a real slowapi bug: it never sets request.state.view_rate_limit
# on the swallowed path, and SlowAPIMiddleware unconditionally reads that
# attribute afterward, crashing every request anyway. in_memory_fallback goes
# through the normal code path instead, so the state is always set correctly.
limiter = Limiter(
    key_func=get_real_client_ip,
    storage_uri=REDIS_URL,
    storage_options={"socket_connect_timeout": 2, "socket_timeout": 2},
    in_memory_fallback_enabled=True,
    in_memory_fallback=["100/minute"],
    default_limits=["100/minute"],
)
