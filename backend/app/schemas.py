from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from .models import CallKind, CallPolicy, CallStatus, LandType, ListingStatus, Role


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------- users ----------
class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: Role
    phone: str | None = Field(default=None, max_length=20)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class PublicUser(ORM):
    """What other users may see. No email, no phone."""

    id: int
    name: str
    role: Role
    about: str


class MeOut(PublicUser):
    email: EmailStr
    phone: str | None
    call_policy: CallPolicy
    created_at: datetime


class MeUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=80)
    about: str | None = Field(default=None, max_length=200)
    phone: str | None = Field(default=None, max_length=20)
    call_policy: CallPolicy | None = None


class AuthOut(BaseModel):
    token: str
    user: MeOut


# ---------- listings ----------
class ListingIn(BaseModel):
    title: str = Field(min_length=3, max_length=120)
    description: str = Field(default="", max_length=4000)
    price: int = Field(gt=0)
    area_sqft: float = Field(gt=0)
    land_type: LandType
    address: str = Field(default="", max_length=200)
    city: str = Field(min_length=2, max_length=80)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    show_exact_location: bool = True


class ListingUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=120)
    description: str | None = Field(default=None, max_length=4000)
    price: int | None = Field(default=None, gt=0)
    area_sqft: float | None = Field(default=None, gt=0)
    land_type: LandType | None = None
    address: str | None = Field(default=None, max_length=200)
    city: str | None = Field(default=None, min_length=2, max_length=80)
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    show_exact_location: bool | None = None
    status: ListingStatus | None = None


class ListingOut(BaseModel):
    id: int
    title: str
    description: str
    price: int
    area_sqft: float
    land_type: LandType
    address: str
    city: str
    lat: float
    lng: float
    location_is_approximate: bool
    show_exact_location: bool
    status: ListingStatus
    owner: PublicUser
    image_ids: list[int]
    created_at: datetime
    updated_at: datetime
    is_mine: bool


class ImageIn(BaseModel):
    content_type: str = Field(pattern=r"^image/(jpeg|png|webp)$")
    data_base64: str


# ---------- chat ----------
class ConversationIn(BaseModel):
    user_id: int
    listing_id: int | None = None


class ListingBrief(ORM):
    id: int
    title: str
    price: int
    city: str


class MessageOut(ORM):
    id: int
    conversation_id: int
    sender_id: int
    kind: str
    body: str
    created_at: datetime
    read_at: datetime | None


class ConversationOut(BaseModel):
    id: int
    other: PublicUser
    listing: ListingBrief | None
    last_message: MessageOut | None
    unread: int
    last_message_at: datetime


class MessageIn(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


# ---------- calls ----------
class CallIn(BaseModel):
    conversation_id: int
    kind: CallKind


class CallOut(BaseModel):
    id: int
    conversation_id: int
    kind: CallKind
    status: CallStatus
    caller: PublicUser
    callee: PublicUser
    created_at: datetime
    answered_at: datetime | None
    ended_at: datetime | None


class MediaToken(BaseModel):
    livekit_url: str
    token: str
    room: str


class CallJoinOut(BaseModel):
    call: CallOut
    media: MediaToken


# ---------- meeting rooms ----------
class RoomIn(BaseModel):
    title: str = Field(min_length=3, max_length=120)
    listing_id: int | None = None
    participant_ids: list[int] = Field(default_factory=list, max_length=20)
    scheduled_at: datetime | None = None


class RoomOut(BaseModel):
    id: int
    title: str
    host: PublicUser
    listing: ListingBrief | None
    scheduled_at: datetime | None
    participants: list[PublicUser]
    created_at: datetime
