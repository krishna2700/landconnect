# LandConnect: technical documentation

## 1. Technologies and frameworks

| Layer | Choice | Why |
|---|---|---|
| Mobile | React Native via **Expo SDK 58**, TypeScript, **Expo Router** | One codebase for Android, iOS and web. File-based routing. EAS builds an APK in the cloud. |
| Backend | **FastAPI** (Python 3.13), **SQLAlchemy 2**, **Pydantic v2** | Typed request/response models, automatic OpenAPI docs at `/docs`, fast to write and test. |
| Database | **PostgreSQL** in production, SQLite for local dev and tests | Same ORM models for both; the database URL is set in `config.py`. |
| Auth | JWT (PyJWT, HS256) + bcrypt | Stateless tokens. The same token authenticates the REST calls and the WebSocket. |
| Real-time | FastAPI **WebSockets** | Delivers new messages, typing, read receipts, incoming calls, call state changes and meeting invites. |
| Calls | **LiveKit** (WebRTC SFU) with `@livekit/react-native` and `livekit-client` | Handles NAT traversal (TURN), codecs, echo cancellation and group rooms. Our backend only issues room-scoped tokens. |
| Maps | **Leaflet + OpenStreetMap** inside a WebView (iframe on web) | No API key, so the APK map works without Google Maps billing setup. The same HTML serves both platforms. |
| Media | expo-image-picker, expo-image-manipulator, expo-location | Photos are resized to 1280 px JPEG on the phone before upload. GPS sets the listing pin. |
| Deploy | Render (API, Postgres, static web app); EAS Build (APK) | All on free tiers, with a public URL the APK can reach. |

## 2. Architecture

```
 ┌──────────── Expo app (Android / web) ─────────────┐
 │ Screens (Expo Router)                             │
 │   Chats · Community · Calls · Profile             │
 │   Chat · Listing · Edit · Call · Meeting · Room   │
 │ Providers: Session → Realtime(WebSocket) → Calls  │
 └──────┬──────────────────┬───────────────┬─────────┘
        │ REST (JWT)       │ WS /ws?token= │ WebRTC media
        ▼                  ▼               ▼
 ┌──────────── FastAPI ─────────────┐   ┌───────────┐
 │ routers: users, listings, chats, │   │  LiveKit  │
 │          calls, rooms            │   │   (SFU)   │
 │ realtime.Hub (user → sockets)    │   └───────────┘
 │ media.py: room-scoped JWTs ──────┼──────────▲
 └──────────────┬───────────────────┘
                ▼
           PostgreSQL
```

### Call flow (signalling over our API, media over LiveKit)

1. The caller taps Voice or Video. `POST /calls {conversation_id, kind}`.
   - The server checks the caller is in the chat, the callee's call policy, and that neither side is busy.
   - It creates a `Call(status=ringing)` with a random room name and returns a LiveKit token for the caller.
2. The server pushes `call_incoming` over the callee's WebSocket, and the callee sees the full-screen ringing screen.
   - If the socket was reconnecting at that moment, the app asks `GET /calls/incoming/active` when the socket reconnects.
3. The callee's choice:
   - **Accept**: `POST /calls/{id}/accept` sets `accepted`, returns the callee's token, and pushes `call_updated` to both. Both phones join the same LiveKit room.
   - **Decline**: `POST /calls/{id}/reject`.
   - **No answer**: a 45 s server-side timer marks the call `missed`.
4. **End**: either side calls `POST /calls/{id}/end`. The server records the duration and writes a call-log message into the chat. Ending also happens when:
   - the other participant leaves the media room;
   - the media connection fails.
5. Every state change is pushed to both users, so the UIs stay in sync without polling.

Meeting rooms use the same token mechanism. Only the host and invited users can get a token for a room.

### Data model

- `users`: name, email, phone (private), role, about, call policy.
- `listings`: listing data plus `show_exact_location` and `status`. `listing_images` stores the image bytes.
- `conversations`: one row per pair of users per listing. `messages` holds `kind = text | call`.
- `calls`: caller, callee, kind, status, room name, answered/ended timestamps.
- `meeting_rooms` and `meeting_participants`.

## 3. Key implementation decisions

- **Privacy lives in the API, not the UI.**
  - `PublicUser` (the only user shape other users ever get) has no email or phone.
  - `serializers.listing_out` rounds coordinates to 2 decimals and drops the street address for non-owners when exact location is off.
  - Role checks (`require_roles`) and ownership checks happen on the server. Tests cover each of these.
- **Who can call me** is a per-user policy:
  - `everyone`: anyone in a chat with you.
  - `contacts`: only after you have replied in that chat.
  - `nobody`: chat only.
  
  Because calls always start from a chat, nobody can cold-call a user they have never messaged.
- **Calling vendor vs. self-hosted WebRTC.** Peer-to-peer WebRTC needs a TURN server to work reliably across mobile networks. LiveKit provides TURN and an SFU, so 1:1 calls and group meeting rooms use the same code. The backend stays vendor-light: tokens are standard JWTs signed with PyJWT, with no LiveKit SDK on the server.
- **Signalling over our own WebSocket.** Ringing, accept, decline and missed states are our business logic and are stored in Postgres. LiveKit only carries media. This also gives us call history and chat call logs.
- **The incoming-call screen is a global overlay** rendered by the root layout from `CallsProvider`, so a call rings on any screen.
- **Maps without API keys.** Leaflet in a WebView talks to React Native through `postMessage`. Tapping the map or dragging the pin sets the location. Approximate listings draw a circle instead of a pin.
- **Images in Postgres.** Render's free disk is ephemeral, so photos are stored as bytes (max 2 MB after client-side compression, 6 per listing) and served with cache headers. In production they would go to object storage (S3/R2).
- **Platform-specific files**: `CallStage.tsx` / `CallStage.web.tsx` and `LandMap.tsx` / `LandMap.web.tsx`. Both platforms share one `StageBody`, so the call UI and controls are written once.

## 4. Challenges and how they were solved

- **WebRTC in Expo.** LiveKit's native WebRTC module is not in Expo Go. The app uses LiveKit's Expo config plugins and a custom `index.js` entry that calls `registerGlobals()` before Expo Router loads. APKs are built with EAS. The web build uses `livekit-client` directly, so a phone can call a browser.
- **Missed calls without a job queue.** An `asyncio` task scheduled after the call is created checks back after the ring timeout and marks the call missed only if it is still ringing. This keeps the state machine correct when accept and timeout race. Because that timer lives in memory, it is lost if the free-tier server sleeps or restarts, so starting a call also closes stale calls first: ringing past the timeout becomes missed, and an accepted call the caller abandoned is ended.
- **Socket gaps.** The realtime provider:
  - reconnects with exponential backoff and when the app returns to the foreground;
  - pings every 25 s so Render's proxy doesn't drop idle sockets.
  
  After a reconnect, screens re-fetch so missed messages and ringing calls still appear.
- **SQLite vs Postgres timestamps.** SQLite drops timezone info, which broke call-duration maths in tests. Timestamps are made timezone-aware before subtracting.

## 5. Testing

- `backend/tests/test_api.py` has 11 tests:
  - registration, login, duplicate email;
  - role permissions;
  - owner-only edits and location privacy;
  - images;
  - chat, unread counts and read receipts;
  - the full call lifecycle: ring, busy, accept, end, call-log message;
  - decline and cancel;
  - stale calls (lost ring timer, abandoned call) never block new calls;
  - the call-privacy policy;
  - meeting-room access;
  - live WebSocket push.
- The app passes `tsc --noEmit` and `expo-doctor`. The web build was exercised in a browser against the local API: demo sign-in, listings, map, chat with live replies, incoming call, decline, and accept/end with call logs.

## 6. Known limitations / next steps

- Calls ring only while the app is open. Background ringing needs push notifications (FCM) plus a native call UI (CallKeep / ConnectionService).
- Photos are stored in the database. Move them to object storage with signed URLs.
- One API instance holds the WebSocket hub in memory. To scale out, put Redis pub/sub behind `Hub.send`.
- No KYC or land-title verification, and no listing moderation.

## 7. AI tools usage summary

The project was built with **Claude Code** (Anthropic) as an AI pair programmer, with the developer making the product and architecture decisions. Here is how AI helped:

- **Architecture and stack choices**: comparing calling options (self-hosted WebRTC vs LiveKit) and hosting/build options given the deadline and a machine without the Android SDK. The developer chose LiveKit + Expo + FastAPI on Render.
- **Scaffolding and implementation**: generating the FastAPI routers, SQLAlchemy models, Expo Router screens and the call state machine. Each part was reviewed and adjusted for the requirements: privacy rules, role checks, and call states.
- **Checking current APIs**: reading the Expo SDK 58 and LiveKit docs and the installed package typings, instead of relying on remembered APIs that may be outdated.
- **Testing and debugging**: writing the API test suite, which caught a timezone bug with SQLite. Driving the web build in a browser to check chat, real-time delivery and the incoming-call flow.
- **Documentation**: drafting this document and the README.

Every part of the code was reviewed and can be explained end to end: the data model, the call signalling flow, the privacy rules and the deployment setup.
