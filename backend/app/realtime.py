"""In-process WebSocket hub.

Each signed-in app keeps one socket open. The API pushes events (new message,
incoming call, call answered/ended, meeting invite) to the users involved.
One instance is enough for this prototype; a multi-instance deployment would
put Redis pub/sub behind `send`.
"""

import asyncio
import logging
from collections import defaultdict
from typing import Any

from fastapi import WebSocket

log = logging.getLogger("landconnect.realtime")


class Hub:
    def __init__(self) -> None:
        self._sockets: dict[int, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect(self, user_id: int, ws: WebSocket) -> None:
        async with self._lock:
            self._sockets[user_id].add(ws)

    async def disconnect(self, user_id: int, ws: WebSocket) -> None:
        async with self._lock:
            self._sockets[user_id].discard(ws)
            if not self._sockets[user_id]:
                self._sockets.pop(user_id, None)

    def is_online(self, user_id: int) -> bool:
        return bool(self._sockets.get(user_id))

    async def send(self, user_id: int, event: str, data: Any) -> None:
        for ws in list(self._sockets.get(user_id, ())):
            try:
                await ws.send_json({"event": event, "data": data})
            except Exception:  # socket died between check and send
                log.info("dropping dead socket for user %s", user_id)
                await self.disconnect(user_id, ws)

    async def send_many(self, user_ids: list[int], event: str, data: Any) -> None:
        await asyncio.gather(*(self.send(uid, event, data) for uid in set(user_ids)))


hub = Hub()
