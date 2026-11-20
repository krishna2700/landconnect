from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..auth import current_user
from ..db import get_db
from ..models import Conversation, Listing, Message, User, utcnow
from ..realtime import hub
from ..schemas import ConversationIn, ConversationOut, MessageIn, MessageOut
from ..serializers import conversation_out

router = APIRouter(prefix="/conversations", tags=["chat"])


def get_member_conversation(db: Session, conversation_id: int, user: User) -> Conversation:
    conv = db.get(Conversation, conversation_id)
    if conv is None or not conv.has_member(user.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Chat not found")
    return conv


def post_message(db: Session, conv: Conversation, sender_id: int, body: str, kind: str = "text") -> Message:
    msg = Message(conversation_id=conv.id, sender_id=sender_id, body=body, kind=kind)
    db.add(msg)
    conv.last_message_at = utcnow()
    db.commit()
    db.refresh(msg)
    return msg


@router.post("", response_model=ConversationOut)
def open_conversation(body: ConversationIn, me: User = Depends(current_user), db: Session = Depends(get_db)):
    """Get or create the 1:1 thread between me and another user (optionally about a listing)."""
    if body.user_id == me.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You can't start a chat with yourself")
    if db.get(User, body.user_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if body.listing_id is not None and db.get(Listing, body.listing_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Listing not found")
    a, b = sorted((me.id, body.user_id))
    stmt = select(Conversation).where(
        Conversation.user_a_id == a,
        Conversation.user_b_id == b,
        Conversation.listing_id.is_(None) if body.listing_id is None else Conversation.listing_id == body.listing_id,
    )
    conv = db.scalars(stmt).first()
    if conv is None:
        conv = Conversation(user_a_id=a, user_b_id=b, listing_id=body.listing_id)
        db.add(conv)
        try:
            db.commit()
        except IntegrityError:  # created concurrently by the other user
            db.rollback()
            conv = db.scalars(stmt).one()
        db.refresh(conv)
    return conversation_out(db, conv, me)


@router.get("", response_model=list[ConversationOut])
def list_conversations(me: User = Depends(current_user), db: Session = Depends(get_db)):
    convs = db.scalars(
        select(Conversation)
        .where((Conversation.user_a_id == me.id) | (Conversation.user_b_id == me.id))
        .order_by(Conversation.last_message_at.desc())
    ).all()
    return [conversation_out(db, c, me) for c in convs]


@router.get("/{conversation_id}", response_model=ConversationOut)
def get_conversation(conversation_id: int, me: User = Depends(current_user), db: Session = Depends(get_db)):
    return conversation_out(db, get_member_conversation(db, conversation_id, me), me)


@router.get("/{conversation_id}/messages", response_model=list[MessageOut])
def list_messages(
    conversation_id: int,
    before_id: int | None = None,
    limit: int = Query(default=50, le=200),
    me: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    get_member_conversation(db, conversation_id, me)
    stmt = select(Message).where(Message.conversation_id == conversation_id)
    if before_id:
        stmt = stmt.where(Message.id < before_id)
    rows = db.scalars(stmt.order_by(Message.id.desc()).limit(limit)).all()
    return list(reversed(rows))


@router.post("/{conversation_id}/messages", response_model=MessageOut, status_code=201)
def send_message(
    conversation_id: int,
    body: MessageIn,
    tasks: BackgroundTasks,
    me: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    conv = get_member_conversation(db, conversation_id, me)
    msg = post_message(db, conv, me.id, body.body.strip())
    out = MessageOut.model_validate(msg)
    tasks.add_task(hub.send_many, [conv.user_a_id, conv.user_b_id], "message", out.model_dump(mode="json"))
    return out


@router.post("/{conversation_id}/read", status_code=204)
def mark_read(
    conversation_id: int, tasks: BackgroundTasks, me: User = Depends(current_user), db: Session = Depends(get_db)
):
    conv = get_member_conversation(db, conversation_id, me)
    result = db.execute(
        update(Message)
        .where(Message.conversation_id == conv.id, Message.sender_id != me.id, Message.read_at.is_(None))
        .values(read_at=utcnow())
    )
    db.commit()
    if result.rowcount:
        tasks.add_task(hub.send, conv.other(me.id).id, "read", {"conversation_id": conv.id, "reader_id": me.id})
