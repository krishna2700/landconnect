"""LiveKit access tokens.

LiveKit tokens are HS256 JWTs signed with the project's API secret, so PyJWT
is enough; no SDK needed. Each call or meeting gets its own room name, and a
token only lets its holder into that one room.
"""

import time

import jwt
from fastapi import HTTPException, status

from .config import get_settings
from .models import User
from .schemas import MediaToken


def media_token(user: User, room: str, ttl_seconds: int = 2 * 3600) -> MediaToken:
    s = get_settings()
    if not s.livekit_enabled:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Calling is not configured on the server (LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET)",
        )
    now = int(time.time())
    claims = {
        "iss": s.livekit_api_key,
        "sub": f"user-{user.id}",
        "name": user.name,
        "nbf": now - 10,
        "exp": now + ttl_seconds,
        "video": {
            "room": room,
            "roomJoin": True,
            "canPublish": True,
            "canSubscribe": True,
            "canPublishData": True,
        },
        "metadata": f'{{"role":"{user.role.value}"}}',
    }
    token = jwt.encode(claims, s.livekit_api_secret, algorithm="HS256")
    return MediaToken(livekit_url=s.livekit_url, token=token, room=room)
