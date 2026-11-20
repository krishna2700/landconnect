from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import Call, Conversation, Listing, MeetingRoom, Message, User
from .schemas import (
    CallOut,
    ConversationOut,
    ListingBrief,
    ListingOut,
    MessageOut,
    PublicUser,
    RoomOut,
)

APPROX_DECIMALS = 2  # ~1.1 km at the equator


def listing_out(listing: Listing, viewer: User | None) -> ListingOut:
    is_mine = viewer is not None and viewer.id == listing.owner_id
    approximate = not listing.show_exact_location and not is_mine
    lat, lng = listing.lat, listing.lng
    address = listing.address
    if approximate:
        lat, lng = round(lat, APPROX_DECIMALS), round(lng, APPROX_DECIMALS)
        address = ""  # street address is private until the owner shares it in chat
    return ListingOut(
        id=listing.id,
        title=listing.title,
        description=listing.description,
        price=listing.price,
        area_sqft=listing.area_sqft,
        land_type=listing.land_type,
        address=address,
        city=listing.city,
        lat=lat,
        lng=lng,
        location_is_approximate=approximate,
        show_exact_location=listing.show_exact_location,
        status=listing.status,
        owner=PublicUser.model_validate(listing.owner),
        image_ids=[img.id for img in listing.images],
        created_at=listing.created_at,
        updated_at=listing.updated_at,
        is_mine=is_mine,
    )


def conversation_out(db: Session, conv: Conversation, me: User) -> ConversationOut:
    last = db.scalars(
        select(Message).where(Message.conversation_id == conv.id).order_by(Message.id.desc()).limit(1)
    ).first()
    unread = db.scalar(
        select(func.count(Message.id)).where(
            Message.conversation_id == conv.id,
            Message.sender_id != me.id,
            Message.read_at.is_(None),
        )
    )
    return ConversationOut(
        id=conv.id,
        other=PublicUser.model_validate(conv.other(me.id)),
        listing=ListingBrief.model_validate(conv.listing) if conv.listing else None,
        last_message=MessageOut.model_validate(last) if last else None,
        unread=unread or 0,
        last_message_at=conv.last_message_at,
    )


def call_out(call: Call) -> CallOut:
    return CallOut(
        id=call.id,
        conversation_id=call.conversation_id,
        kind=call.kind,
        status=call.status,
        caller=PublicUser.model_validate(call.caller),
        callee=PublicUser.model_validate(call.callee),
        created_at=call.created_at,
        answered_at=call.answered_at,
        ended_at=call.ended_at,
    )


def room_out(room: MeetingRoom) -> RoomOut:
    return RoomOut(
        id=room.id,
        title=room.title,
        host=PublicUser.model_validate(room.host),
        listing=ListingBrief.model_validate(room.listing) if room.listing else None,
        scheduled_at=room.scheduled_at,
        participants=[PublicUser.model_validate(p.user) for p in room.participants],
        created_at=room.created_at,
    )
