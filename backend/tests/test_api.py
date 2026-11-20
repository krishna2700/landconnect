import os
import tempfile

_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False).name
os.environ.update(
    DATABASE_URL=f"sqlite:///{_db}",
    JWT_SECRET="test-secret",
    LIVEKIT_URL="wss://example.livekit.cloud",
    LIVEKIT_API_KEY="APIkey",
    LIVEKIT_API_SECRET="secret-secret-secret-secret-secret",
    SEED_DEMO_DATA="false",
    RING_TIMEOUT_SECONDS="600",
)

import base64  # noqa: E402

import jwt  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

LISTING = {
    "title": "Test farm",
    "description": "Nice land",
    "price": 1000000,
    "area_sqft": 43560,
    "land_type": "agricultural",
    "address": "Plot 7, Secret Lane",
    "city": "Mysuru",
    "lat": 12.345678,
    "lng": 76.654321,
    "show_exact_location": False,
}


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


_n = 0


def signup(client, role, **extra):
    global _n
    _n += 1
    r = client.post(
        "/auth/register",
        json={"name": f"{role} {_n}", "email": f"{role}{_n}@t.io", "password": "password1", "role": role, **extra},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    return body["user"], {"Authorization": f"Bearer {body['token']}"}


def test_register_login_and_duplicate(client):
    user, _ = signup(client, "buyer", phone="9999999999")
    assert user["phone"] == "9999999999"
    r = client.post("/auth/login", json={"email": user["email"], "password": "password1"})
    assert r.status_code == 200
    assert client.post("/auth/login", json={"email": user["email"], "password": "nope1234"}).status_code == 401
    dup = client.post(
        "/auth/register", json={"name": "x y", "email": user["email"], "password": "password1", "role": "buyer"}
    )
    assert dup.status_code == 409


def test_buyer_cannot_list_but_seller_and_broker_can(client):
    _, buyer = signup(client, "buyer")
    assert client.post("/listings", json=LISTING, headers=buyer).status_code == 403
    for role in ("seller", "broker"):
        _, h = signup(client, role)
        assert client.post("/listings", json=LISTING, headers=h).status_code == 201


def test_only_owner_can_edit_and_location_privacy(client):
    _, seller = signup(client, "seller")
    _, other = signup(client, "broker")
    listing = client.post("/listings", json=LISTING, headers=seller).json()
    assert listing["lat"] == LISTING["lat"] and listing["address"]  # owner sees exact

    public = client.get(f"/listings/{listing['id']}").json()
    assert public["location_is_approximate"] is True
    assert public["lat"] == 12.35 and public["address"] == ""
    assert "email" not in public["owner"] and "phone" not in public["owner"]

    assert client.patch(f"/listings/{listing['id']}", json={"price": 5}, headers=other).status_code == 403
    r = client.patch(f"/listings/{listing['id']}", json={"price": 2000000}, headers=seller)
    assert r.status_code == 200 and r.json()["price"] == 2000000


def test_images(client):
    _, seller = signup(client, "seller")
    listing = client.post("/listings", json=LISTING, headers=seller).json()
    png = base64.b64encode(b"\x89PNG\r\n\x1a\nfake").decode()
    r = client.post(
        f"/listings/{listing['id']}/images", json={"content_type": "image/png", "data_base64": png}, headers=seller
    )
    assert r.status_code == 201
    image_id = r.json()["image_ids"][0]
    img = client.get(f"/images/{image_id}")
    assert img.status_code == 200 and img.headers["content-type"] == "image/png"


def test_chat_flow(client):
    buyer_u, buyer = signup(client, "buyer")
    seller_u, seller = signup(client, "seller")
    conv = client.post("/conversations", json={"user_id": seller_u["id"]}, headers=buyer).json()
    again = client.post("/conversations", json={"user_id": buyer_u["id"]}, headers=seller).json()
    assert conv["id"] == again["id"]

    client.post(f"/conversations/{conv['id']}/messages", json={"body": "Is it available?"}, headers=buyer)
    inbox = client.get("/conversations", headers=seller).json()
    assert inbox[0]["unread"] == 1 and inbox[0]["last_message"]["body"] == "Is it available?"
    assert client.post(f"/conversations/{conv['id']}/read", headers=seller).status_code == 204
    assert client.get("/conversations", headers=seller).json()[0]["unread"] == 0

    _, stranger = signup(client, "buyer")
    assert client.get(f"/conversations/{conv['id']}/messages", headers=stranger).status_code == 404


def test_call_lifecycle(client):
    _, buyer = signup(client, "buyer")
    seller_u, seller = signup(client, "seller")
    conv = client.post("/conversations", json={"user_id": seller_u["id"]}, headers=buyer).json()

    started = client.post("/calls", json={"conversation_id": conv["id"], "kind": "video"}, headers=buyer)
    assert started.status_code == 201, started.text
    call = started.json()["call"]
    claims = jwt.decode(started.json()["media"]["token"], "secret-secret-secret-secret-secret", algorithms=["HS256"])
    assert claims["video"]["room"] == started.json()["media"]["room"]

    assert client.get("/calls/incoming/active", headers=seller).json()["id"] == call["id"]
    assert client.post("/calls", json={"conversation_id": conv["id"], "kind": "audio"}, headers=buyer).status_code == 409
    assert client.post(f"/calls/{call['id']}/accept", headers=buyer).status_code == 403  # caller can't answer

    accepted = client.post(f"/calls/{call['id']}/accept", headers=seller)
    assert accepted.status_code == 200 and accepted.json()["call"]["status"] == "accepted"
    ended = client.post(f"/calls/{call['id']}/end", headers=seller).json()
    assert ended["status"] == "ended"

    msgs = client.get(f"/conversations/{conv['id']}/messages", headers=buyer).json()
    assert msgs[-1]["kind"] == "call" and msgs[-1]["body"].startswith("Video call")


def test_decline_and_cancel(client):
    _, buyer = signup(client, "buyer")
    seller_u, seller = signup(client, "seller")
    conv = client.post("/conversations", json={"user_id": seller_u["id"]}, headers=buyer).json()
    c1 = client.post("/calls", json={"conversation_id": conv["id"], "kind": "audio"}, headers=buyer).json()["call"]
    assert client.post(f"/calls/{c1['id']}/reject", headers=seller).json()["status"] == "rejected"
    c2 = client.post("/calls", json={"conversation_id": conv["id"], "kind": "audio"}, headers=buyer).json()["call"]
    assert client.post(f"/calls/{c2['id']}/end", headers=buyer).json()["status"] == "cancelled"
    assert len(client.get("/calls", headers=seller).json()) == 2


def test_call_privacy_policy(client):
    _, buyer = signup(client, "buyer")
    seller_u, seller = signup(client, "seller")
    conv = client.post("/conversations", json={"user_id": seller_u["id"]}, headers=buyer).json()

    client.patch("/me", json={"call_policy": "nobody"}, headers=seller)
    assert client.post("/calls", json={"conversation_id": conv["id"], "kind": "audio"}, headers=buyer).status_code == 403

    client.patch("/me", json={"call_policy": "contacts"}, headers=seller)
    assert client.post("/calls", json={"conversation_id": conv["id"], "kind": "audio"}, headers=buyer).status_code == 403
    client.post(f"/conversations/{conv['id']}/messages", json={"body": "Hi, call me"}, headers=seller)
    assert client.post("/calls", json={"conversation_id": conv["id"], "kind": "audio"}, headers=buyer).status_code == 201


def test_meeting_rooms(client):
    host_u, host = signup(client, "broker")
    guest_u, guest = signup(client, "buyer")
    _, outsider = signup(client, "buyer")
    room = client.post("/rooms", json={"title": "Site walkthrough", "participant_ids": [guest_u["id"]]}, headers=host)
    assert room.status_code == 201
    rid = room.json()["id"]
    assert client.get("/rooms", headers=guest).json()[0]["id"] == rid
    assert client.post(f"/rooms/{rid}/join", headers=guest).status_code == 200
    assert client.post(f"/rooms/{rid}/join", headers=outsider).status_code == 404
    assert client.delete(f"/rooms/{rid}", headers=guest).status_code == 403


def test_websocket_push(client):
    buyer_u, buyer = signup(client, "buyer")
    seller_u, seller = signup(client, "seller")
    token = seller["Authorization"].split()[1]
    conv = client.post("/conversations", json={"user_id": seller_u["id"]}, headers=buyer).json()
    with client.websocket_connect(f"/ws?token={token}") as ws:
        client.post(f"/conversations/{conv['id']}/messages", json={"body": "ping over ws"}, headers=buyer)
        evt = ws.receive_json()
        assert evt["event"] == "message" and evt["data"]["body"] == "ping over ws"
        client.post("/calls", json={"conversation_id": conv["id"], "kind": "video"}, headers=buyer)
        evt = ws.receive_json()
        assert evt["event"] == "call_incoming" and evt["data"]["call"]["caller"]["id"] == buyer_u["id"]
