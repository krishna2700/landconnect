"""Meeting rooms: a group video room around a listing (e.g. seller + broker + buyers)."""

import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..auth import current_user
from ..db import get_db
from ..media import media_token
from ..models import Listing, MeetingParticipant, MeetingRoom, User
from ..realtime import hub
from ..schemas import MediaToken, RoomIn, RoomOut
from ..serializers import room_out

router = APIRouter(prefix="/rooms", tags=["meeting rooms"])


def _member_room(db: Session, room_id: int, me: User) -> MeetingRoom:
    room = db.get(MeetingRoom, room_id)
    if room is None or (room.host_id != me.id and all(p.user_id != me.id for p in room.participants)):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Meeting room not found")
    return room


@router.post("", response_model=RoomOut, status_code=201)
def create_room(body: RoomIn, tasks: BackgroundTasks, me: User = Depends(current_user), db: Session = Depends(get_db)):
    if body.listing_id is not None and db.get(Listing, body.listing_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Listing not found")
    invitee_ids = sorted({uid for uid in body.participant_ids if uid != me.id})
    found = db.scalars(select(User.id).where(User.id.in_(invitee_ids))).all() if invitee_ids else []
    if len(found) != len(invitee_ids):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "One of the invited people doesn't exist")
    room = MeetingRoom(
        title=body.title.strip(),
        host_id=me.id,
        listing_id=body.listing_id,
        scheduled_at=body.scheduled_at,
        room_name=f"room-{uuid.uuid4().hex}",
        participants=[MeetingParticipant(user_id=uid) for uid in invitee_ids],
    )
    db.add(room)
    db.commit()
    db.refresh(room)
    out = room_out(room)
    tasks.add_task(hub.send_many, invitee_ids, "room_invite", {"room": out.model_dump(mode="json")})
    return out


@router.get("", response_model=list[RoomOut])
def my_rooms(me: User = Depends(current_user), db: Session = Depends(get_db)):
    rooms = db.scalars(
        select(MeetingRoom)
        .outerjoin(MeetingParticipant)
        .where(or_(MeetingRoom.host_id == me.id, MeetingParticipant.user_id == me.id))
        .order_by(MeetingRoom.created_at.desc())
        .distinct()
    ).all()
    return [room_out(r) for r in rooms]


@router.get("/{room_id}", response_model=RoomOut)
def get_room(room_id: int, me: User = Depends(current_user), db: Session = Depends(get_db)):
    return room_out(_member_room(db, room_id, me))


@router.post("/{room_id}/join", response_model=MediaToken)
def join_room(room_id: int, me: User = Depends(current_user), db: Session = Depends(get_db)):
    room = _member_room(db, room_id, me)
    return media_token(me, room.room_name)


@router.delete("/{room_id}", status_code=204)
def delete_room(room_id: int, me: User = Depends(current_user), db: Session = Depends(get_db)):
    room = _member_room(db, room_id, me)
    if room.host_id != me.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the host can delete a meeting room")
    db.delete(room)
    db.commit()
