import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from .auth import user_id_from_token
from .config import get_settings
from .db import Base, SessionLocal, engine
from .models import Conversation, User
from .realtime import hub
from .routers import calls, chats, listings, rooms, users
from .seed import seed_demo_data

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(engine)
    if get_settings().seed_demo_data:
        with SessionLocal() as db:
            seed_demo_data(db)
    yield


app = FastAPI(title="LandConnect API", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

app.include_router(users.router)
app.include_router(listings.router)
app.include_router(listings.images_router)
app.include_router(chats.router)
app.include_router(calls.router)
app.include_router(rooms.router)


@app.get("/health")
def health():
    return {"ok": True, "calling_enabled": get_settings().livekit_enabled}


@app.websocket("/ws")
async def realtime(ws: WebSocket, token: str = ""):
    uid = user_id_from_token(token)
    if uid is None:
        await ws.close(code=4401)
        return
    with SessionLocal() as db:
        if db.get(User, uid) is None:
            await ws.close(code=4401)
            return
    await ws.accept()
    await hub.connect(uid, ws)
    try:
        while True:
            msg = await ws.receive_json()
            if msg.get("event") == "ping":
                await ws.send_json({"event": "pong", "data": None})
            elif msg.get("event") == "typing" and isinstance(msg.get("conversation_id"), int):
                with SessionLocal() as db:
                    conv = db.get(Conversation, msg["conversation_id"])
                    other = conv.other(uid).id if conv and conv.has_member(uid) else None
                if other is not None:
                    await hub.send(other, "typing", {"from": uid, "conversation_id": conv.id})
    except (WebSocketDisconnect, ValueError):
        pass
    finally:
        await hub.disconnect(uid, ws)
