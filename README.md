# LandConnect

A land marketplace app where buyers, sellers and brokers find land, chat, and make **in-app voice and video calls** without sharing phone numbers. The UI follows WhatsApp's patterns: chat list, chat bubbles with read ticks, a full-screen incoming-call screen, and call logs in the chat.

| | |
|---|---|
| Mobile app | React Native (Expo SDK 58, TypeScript, Expo Router) |
| Backend | Python FastAPI, SQLAlchemy 2, PostgreSQL (SQLite locally) |
| Real-time | WebSockets for messages, typing, read receipts and call signalling |
| Calls | WebRTC through LiveKit (1:1 voice/video calls and group meeting rooms) |
| Maps | Leaflet + OpenStreetMap (no API key needed) |

Technical write-up, architecture and AI-tool usage: [docs/TECHNICAL.md](docs/TECHNICAL.md).

## Features

- **Accounts and roles**: sign up as Buyer, Seller or Broker. JWT auth, bcrypt passwords.
  - Buyers browse, chat and call.
  - Sellers and brokers can also create, edit, mark sold, and delete their own listings. The server enforces this; the UI just hides the buttons.
- **Community (land listings)**: search plus filters by land type and budget, in a list or map view. Each listing shows photos, price, area (acres / sq ft), type, description and location.
- **Listing management**: up to 6 photos per listing (compressed on the phone before upload). Set the location by tapping the map, dragging the pin, or using GPS.
- **Maps and geolocation**: every listing has a map. Owners can switch off **Show exact location**; others then see a ~1 km area and no street address.
- **Messaging**: 1:1 chats, one thread per listing, delivered live over WebSockets. Includes typing indicator, read ticks, unread badges, and a listing banner in the chat.
- **Voice and video calls (key requirement)**: start, receive, accept, decline and end calls inside the app.
  - The callee gets a full-screen ringing screen.
  - Unanswered calls become "Missed" after 45 s.
  - Busy detection.
  - In-call controls: mute, camera on/off, flip camera, hang up.
  - Every call leaves a log line in the chat ("Video call · 2:31", "Missed voice call").
- **Meeting rooms**: create a group video room, optionally tied to a listing (e.g. a site walkthrough with seller, broker and buyers), invite people, and join from the Calls tab.
- **Privacy and access control**:
  - Phone and email are never returned to other users.
  - Each user chooses who can call them: everyone in their chats, only people they have replied to, or nobody.
  - Listing locations can be approximate.
  - Media tokens are scoped to one room and expire.

## Demo accounts

The backend seeds these on first start. Password for all: `Demo@1234`. The sign-in screen has one-tap buttons for them.

| Role | Email |
|---|---|
| Buyer | buyer@landconnect.demo |
| Seller | seller@landconnect.demo |
| Broker | broker@landconnect.demo |

To try a call, sign in as the buyer on one device (or the web app) and as the broker on another. Open a broker listing, then tap **Video**.

## Run locally

### Backend

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate          # Windows; use .venv/bin/activate on macOS/Linux
pip install -r requirements.txt
# Calls need a LiveKit project (free at cloud.livekit.io):
set LIVEKIT_URL=wss://<project>.livekit.cloud
set LIVEKIT_API_KEY=<key>
set LIVEKIT_API_SECRET=<secret>
uvicorn app.main:app --reload --port 8000
pytest -q                        # 11 API tests
```

Without LiveKit keys, everything except the media part of calls works. Starting a call then returns a clear "calling is not configured" error.

### App

```bash
cd app
npm install
echo EXPO_PUBLIC_API_URL=http://<your-LAN-IP>:8000 > .env.local
npx expo start --web             # browser
npx expo run:android             # or a dev build on a phone
```

Calls use native WebRTC, so they **do not work in Expo Go**. Use the APK, a development build, or the web app.

## Build the Android APK

```bash
cd app
npx eas-cli@latest login
npx eas-cli@latest build -p android --profile preview
```

EAS prints a download link for the `.apk`. Before building, set `extra.apiUrl` in `app/app.json` to the deployed API URL.

## Deploy (Render)

`render.yaml` is a Render Blueprint that creates:

- the FastAPI service
- a free PostgreSQL database
- a static site with the web build of the app

In Render, choose **New → Blueprint**, pick this repo, and enter the three LiveKit values when asked. If Render gives the services different URLs, update `EXPO_PUBLIC_API_URL` in `render.yaml` and `extra.apiUrl` in `app/app.json`.

Free Render services sleep when idle, so the first request after a while takes about a minute.

## Project layout

```
backend/
  app/
    main.py          FastAPI app, WebSocket endpoint, startup
    models.py        SQLAlchemy models (users, listings, images, chats, calls, meeting rooms)
    schemas.py       Pydantic request/response models (PublicUser never has email/phone)
    auth.py          JWT + bcrypt, role guards
    realtime.py      WebSocket hub that pushes events to users
    media.py         LiveKit room tokens
    serializers.py   Privacy rules (approximate location, public profiles)
    routers/         users, listings, chats, calls, rooms
  tests/test_api.py
app/
  src/app/           Expo Router screens: (tabs) chats/community/calls/profile, chat, listing, call, meeting, room
  src/lib/           API client, session, realtime socket, call state
  src/components/    UI kit, map (WebView / iframe), call stage (native / web), incoming call
render.yaml          Deployment blueprint
docs/TECHNICAL.md    Technical documentation and AI tools summary
```
