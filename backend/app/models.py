from datetime import datetime, timezone
from enum import Enum

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Role(str, Enum):
    buyer = "buyer"
    seller = "seller"
    broker = "broker"


class CallPolicy(str, Enum):
    everyone = "everyone"  # anyone who has a chat with me can call
    contacts = "contacts"  # only people I have replied to
    nobody = "nobody"


class LandType(str, Enum):
    agricultural = "agricultural"
    residential = "residential"
    commercial = "commercial"
    industrial = "industrial"


class ListingStatus(str, Enum):
    active = "active"
    sold = "sold"
    hidden = "hidden"


class CallKind(str, Enum):
    audio = "audio"
    video = "video"


class CallStatus(str, Enum):
    ringing = "ringing"
    accepted = "accepted"
    rejected = "rejected"
    missed = "missed"
    cancelled = "cancelled"
    ended = "ended"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    # Phone is stored for account recovery only and is never returned to other users.
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(100))
    role: Mapped[Role] = mapped_column(SAEnum(Role, native_enum=False, length=10))
    about: Mapped[str] = mapped_column(String(200), default="")
    call_policy: Mapped[CallPolicy] = mapped_column(
        SAEnum(CallPolicy, native_enum=False, length=10), default=CallPolicy.everyone
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    listings: Mapped[list["Listing"]] = relationship(back_populates="owner")


class Listing(Base):
    __tablename__ = "listings"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text, default="")
    price: Mapped[int] = mapped_column(Integer)  # INR
    area_sqft: Mapped[float] = mapped_column(Float)
    land_type: Mapped[LandType] = mapped_column(SAEnum(LandType, native_enum=False, length=15))
    address: Mapped[str] = mapped_column(String(200), default="")
    city: Mapped[str] = mapped_column(String(80), index=True)
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    show_exact_location: Mapped[bool] = mapped_column(Boolean, default=True)
    status: Mapped[ListingStatus] = mapped_column(
        SAEnum(ListingStatus, native_enum=False, length=10), default=ListingStatus.active
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    owner: Mapped[User] = relationship(back_populates="listings")
    images: Mapped[list["ListingImage"]] = relationship(
        back_populates="listing", cascade="all, delete-orphan", order_by="ListingImage.position"
    )


class ListingImage(Base):
    __tablename__ = "listing_images"

    id: Mapped[int] = mapped_column(primary_key=True)
    listing_id: Mapped[int] = mapped_column(ForeignKey("listings.id", ondelete="CASCADE"), index=True)
    content_type: Mapped[str] = mapped_column(String(40))
    data: Mapped[bytes] = mapped_column(LargeBinary)
    position: Mapped[int] = mapped_column(Integer, default=0)

    listing: Mapped[Listing] = relationship(back_populates="images")


class Conversation(Base):
    __tablename__ = "conversations"
    __table_args__ = (UniqueConstraint("user_a_id", "user_b_id", "listing_id", name="uq_conversation"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    # user_a_id < user_b_id, so a pair of users has one thread per listing.
    user_a_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    user_b_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    listing_id: Mapped[int | None] = mapped_column(ForeignKey("listings.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_message_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)

    user_a: Mapped[User] = relationship(foreign_keys=[user_a_id])
    user_b: Mapped[User] = relationship(foreign_keys=[user_b_id])
    listing: Mapped[Listing | None] = relationship()

    def other(self, user_id: int) -> User:
        return self.user_b if self.user_a_id == user_id else self.user_a

    def has_member(self, user_id: int) -> bool:
        return user_id in (self.user_a_id, self.user_b_id)


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    conversation_id: Mapped[int] = mapped_column(ForeignKey("conversations.id", ondelete="CASCADE"), index=True)
    sender_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(10), default="text")  # text | call
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Call(Base):
    __tablename__ = "calls"

    id: Mapped[int] = mapped_column(primary_key=True)
    conversation_id: Mapped[int] = mapped_column(ForeignKey("conversations.id", ondelete="CASCADE"), index=True)
    caller_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    callee_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[CallKind] = mapped_column(SAEnum(CallKind, native_enum=False, length=10))
    status: Mapped[CallStatus] = mapped_column(
        SAEnum(CallStatus, native_enum=False, length=10), default=CallStatus.ringing
    )
    room_name: Mapped[str] = mapped_column(String(80), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    answered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    caller: Mapped[User] = relationship(foreign_keys=[caller_id])
    callee: Mapped[User] = relationship(foreign_keys=[callee_id])


class MeetingRoom(Base):
    __tablename__ = "meeting_rooms"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(120))
    host_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    listing_id: Mapped[int | None] = mapped_column(ForeignKey("listings.id", ondelete="SET NULL"), nullable=True)
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    room_name: Mapped[str] = mapped_column(String(80), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    host: Mapped[User] = relationship()
    listing: Mapped[Listing | None] = relationship()
    participants: Mapped[list["MeetingParticipant"]] = relationship(cascade="all, delete-orphan")


class MeetingParticipant(Base):
    __tablename__ = "meeting_participants"

    room_id: Mapped[int] = mapped_column(ForeignKey("meeting_rooms.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)

    user: Mapped[User] = relationship()
