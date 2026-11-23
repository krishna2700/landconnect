import asyncio
import logging
import uuid
from datetime import timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import exists, or_, select
from sqlalchemy.orm import Session

from ..auth import current_user
from ..config import get_settings
from ..db import SessionLocal, get_db
from ..media import media_token
from ..models import Call, CallKind, CallPolicy, CallStatus, Message, User, utcnow
from ..realtime import hub
from ..schemas import CallIn, CallJoinOut, CallOut
from ..serializers import call_out
from .chats import get_member_conversation, post_message

router = APIRouter(prefix="/calls", tags=["calls"])
log = logging.getLogger("landconnect.calls")

ACTIVE = (CallStatus.ringing, CallStatus.accepted)
MAX_CALL_HOURS = 3
_timeouts: set[asyncio.Task] = set()


def _get_call(db: Session, call_id: int, me: User) -> Call:
    call = db.get(Call, call_id)
    if call is None or me.id not in (call.caller_id, call.callee_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Call not found")
    return call


def _aware(dt):  # SQLite drops tzinfo on read; Postgres keeps it
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _clear_stale(db: Session, caller_id: int, callee_id: int) -> list[tuple[list[int], dict]]:
    """Close calls that can't really still be live, so a lost state never blocks new calls.

    - A call still "ringing" past the ring timeout: the in-memory timer was lost
      (e.g. the free-tier server slept or restarted), so mark it missed now.
    - Any "accepted" call of the person starting a new call: they've left it.
    - An "accepted" call older than MAX_CALL_HOURS: the app was killed without hanging up.
    """
    now = utcnow()
    ring_cutoff = now - timedelta(seconds=get_settings().ring_timeout_seconds + 15)
    call_cutoff = now - timedelta(hours=MAX_CALL_HOURS)
    events = []
    calls = db.scalars(
        select(Call).where(
            or_(Call.caller_id.in_([caller_id, callee_id]), Call.callee_id.in_([caller_id, callee_id])),
            Call.status.in_(ACTIVE),
        )
    ).all()
    for call in calls:
        if call.status == CallStatus.ringing and _aware(call.created_at) < ring_cutoff:
            payload = _finish(db, call, CallStatus.missed)
        elif call.status == CallStatus.accepted and (
            caller_id in (call.caller_id, call.callee_id) or _aware(call.answered_at or call.created_at) < call_cutoff
        ):
            payload = _finish(db, call, CallStatus.ended)
        else:
            continue
        events.append(([call.caller_id, call.callee_id], payload))
    return events


def _is_busy(db: Session, user_id: int) -> bool:
    return bool(
        db.scalar(
            select(
                exists().where(
                    or_(Call.caller_id == user_id, Call.callee_id == user_id),
                    Call.status.in_(ACTIVE),
                )
            )
        )
    )


def _fmt_duration(call: Call) -> str:
    if not (call.answered_at and call.ended_at):
        return ""
    secs = max(0, int((_aware(call.ended_at) - _aware(call.answered_at)).total_seconds()))
    return f"{secs // 60}:{secs % 60:02d}"


def _finish(db: Session, call: Call, new_status: CallStatus) -> dict:
    """Close a call, drop a WhatsApp-style log line into the chat, and return the event payload."""
    call.status = new_status
    call.ended_at = utcnow()
    label = "Video call" if call.kind == CallKind.video else "Voice call"
    body = {
        CallStatus.ended: f"{label} · {_fmt_duration(call)}",
        CallStatus.missed: f"Missed {label.lower()}",
        CallStatus.rejected: f"{label} · declined",
        CallStatus.cancelled: f"{label} · cancelled",
    }[new_status]
    conv = get_member_conversation(db, call.conversation_id, call.caller)
    msg = post_message(db, conv, call.caller_id, body, kind="call")
    return {
        "call": call_out(call).model_dump(mode="json"),
        "message": {
            "id": msg.id,
            "conversation_id": msg.conversation_id,
            "sender_id": msg.sender_id,
            "kind": msg.kind,
            "body": msg.body,
            "created_at": msg.created_at.isoformat(),
            "read_at": None,
        },
    }


async def _expire_if_unanswered(call_id: int, delay: float) -> None:
    await asyncio.sleep(delay)

    def work() -> tuple[list[int], dict] | None:
        with SessionLocal() as db:
            call = db.get(Call, call_id)
            if call is None or call.status != CallStatus.ringing:
                return None
            payload = _finish(db, call, CallStatus.missed)
            return [call.caller_id, call.callee_id], payload

    result = await asyncio.to_thread(work)
    if result:
        users, payload = result
        await hub.send_many(users, "call_updated", payload)


async def _schedule_timeout(call_id: int) -> None:
    task = asyncio.create_task(_expire_if_unanswered(call_id, get_settings().ring_timeout_seconds))
    _timeouts.add(task)  # keep a reference so the task isn't garbage-collected
    task.add_done_callback(_timeouts.discard)


@router.post("", response_model=CallJoinOut, status_code=201)
def start_call(body: CallIn, tasks: BackgroundTasks, me: User = Depends(current_user), db: Session = Depends(get_db)):
    conv = get_member_conversation(db, body.conversation_id, me)
    callee = conv.other(me.id)

    if callee.call_policy == CallPolicy.nobody:
        raise HTTPException(status.HTTP_403_FORBIDDEN, f"{callee.name} isn't accepting calls. Send a message instead.")
    if callee.call_policy == CallPolicy.contacts:
        replied = db.scalar(
            select(exists().where(Message.conversation_id == conv.id, Message.sender_id == callee.id, Message.kind == "text"))
        )
        if not replied:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"{callee.name} only takes calls after replying to your chat. Send a message first.",
            )
    for users, payload in _clear_stale(db, me.id, callee.id):
        tasks.add_task(hub.send_many, users, "call_updated", payload)
    if _is_busy(db, me.id):
        raise HTTPException(status.HTTP_409_CONFLICT, "You're already on a call")
    if _is_busy(db, callee.id):
        raise HTTPException(status.HTTP_409_CONFLICT, f"{callee.name} is on another call")

    # Fail fast if calling isn't configured, before the other phone starts ringing.
    room = f"call-{uuid.uuid4().hex}"
    token = media_token(me, room)

    call = Call(conversation_id=conv.id, caller_id=me.id, callee_id=callee.id, kind=body.kind, room_name=room)
    db.add(call)
    db.commit()
    db.refresh(call)
    out = call_out(call)
    tasks.add_task(hub.send, callee.id, "call_incoming", {"call": out.model_dump(mode="json")})
    tasks.add_task(_schedule_timeout, call.id)
    return CallJoinOut(call=out, media=token)


@router.post("/{call_id}/accept", response_model=CallJoinOut)
def accept(call_id: int, tasks: BackgroundTasks, me: User = Depends(current_user), db: Session = Depends(get_db)):
    call = _get_call(db, call_id, me)
    if call.callee_id != me.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the person being called can answer")
    if call.status != CallStatus.ringing:
        raise HTTPException(status.HTTP_409_CONFLICT, f"This call has already been {call.status.value}")
    token = media_token(me, call.room_name)
    call.status = CallStatus.accepted
    call.answered_at = utcnow()
    db.commit()
    out = call_out(call)
    tasks.add_task(hub.send_many, [call.caller_id, call.callee_id], "call_updated", {"call": out.model_dump(mode="json")})
    return CallJoinOut(call=out, media=token)


@router.post("/{call_id}/reject", response_model=CallOut)
def reject(call_id: int, tasks: BackgroundTasks, me: User = Depends(current_user), db: Session = Depends(get_db)):
    call = _get_call(db, call_id, me)
    if call.callee_id != me.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the person being called can decline")
    if call.status != CallStatus.ringing:
        raise HTTPException(status.HTTP_409_CONFLICT, f"This call has already been {call.status.value}")
    payload = _finish(db, call, CallStatus.rejected)
    tasks.add_task(hub.send_many, [call.caller_id, call.callee_id], "call_updated", payload)
    return call_out(call)


@router.post("/{call_id}/end", response_model=CallOut)
def end(call_id: int, tasks: BackgroundTasks, me: User = Depends(current_user), db: Session = Depends(get_db)):
    call = _get_call(db, call_id, me)
    if call.status not in ACTIVE:
        return call_out(call)  # already over; ending twice is harmless
    if call.status == CallStatus.ringing:
        new_status = CallStatus.cancelled if me.id == call.caller_id else CallStatus.rejected
    else:
        new_status = CallStatus.ended
    payload = _finish(db, call, new_status)
    tasks.add_task(hub.send_many, [call.caller_id, call.callee_id], "call_updated", payload)
    return call_out(call)


@router.get("/{call_id}/join", response_model=CallJoinOut)
def rejoin(call_id: int, me: User = Depends(current_user), db: Session = Depends(get_db)):
    """Fresh media token for an in-progress call (e.g. after the app reconnects)."""
    call = _get_call(db, call_id, me)
    allowed = call.status == CallStatus.accepted or (call.status == CallStatus.ringing and me.id == call.caller_id)
    if not allowed:
        raise HTTPException(status.HTTP_409_CONFLICT, f"This call is {call.status.value}")
    return CallJoinOut(call=call_out(call), media=media_token(me, call.room_name))


@router.get("", response_model=list[CallOut])
def history(me: User = Depends(current_user), db: Session = Depends(get_db)):
    calls = db.scalars(
        select(Call).where(or_(Call.caller_id == me.id, Call.callee_id == me.id)).order_by(Call.id.desc()).limit(100)
    ).all()
    return [call_out(c) for c in calls]


@router.get("/incoming/active", response_model=CallOut | None)
def ringing_for_me(me: User = Depends(current_user), db: Session = Depends(get_db)):
    """Lets the app show a call that started ringing while its socket was reconnecting."""
    call = db.scalars(
        select(Call).where(Call.callee_id == me.id, Call.status == CallStatus.ringing).order_by(Call.id.desc())
    ).first()
    return call_out(call) if call else None
