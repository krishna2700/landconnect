import base64
import binascii

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from ..auth import current_user, optional_user, require_roles
from ..config import get_settings
from ..db import get_db
from ..models import LandType, Listing, ListingImage, ListingStatus, Role, User
from ..schemas import ImageIn, ListingIn, ListingOut, ListingUpdate
from ..serializers import listing_out

router = APIRouter(prefix="/listings", tags=["listings"])
MAX_IMAGES = 6


def _get_owned(db: Session, listing_id: int, user: User) -> Listing:
    listing = db.get(Listing, listing_id)
    if listing is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Listing not found")
    if listing.owner_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only change your own listings")
    return listing


@router.get("", response_model=list[ListingOut])
def browse(
    q: str = "",
    city: str = "",
    land_type: LandType | None = None,
    min_price: int | None = Query(default=None, ge=0),
    max_price: int | None = Query(default=None, ge=0),
    mine: bool = False,
    limit: int = Query(default=30, le=100),
    offset: int = Query(default=0, ge=0),
    viewer: User | None = Depends(optional_user),
    db: Session = Depends(get_db),
):
    stmt = select(Listing).options(selectinload(Listing.images), selectinload(Listing.owner))
    if mine:
        if viewer is None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not signed in")
        stmt = stmt.where(Listing.owner_id == viewer.id)
    else:
        stmt = stmt.where(Listing.status == ListingStatus.active)
    if q.strip():
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(Listing.title.ilike(like), Listing.description.ilike(like), Listing.city.ilike(like)))
    if city.strip():
        stmt = stmt.where(func.lower(Listing.city) == city.strip().lower())
    if land_type:
        stmt = stmt.where(Listing.land_type == land_type)
    if min_price is not None:
        stmt = stmt.where(Listing.price >= min_price)
    if max_price is not None:
        stmt = stmt.where(Listing.price <= max_price)
    stmt = stmt.order_by(Listing.created_at.desc()).limit(limit).offset(offset)
    return [listing_out(item, viewer) for item in db.scalars(stmt).all()]


@router.get("/{listing_id}", response_model=ListingOut)
def detail(listing_id: int, viewer: User | None = Depends(optional_user), db: Session = Depends(get_db)):
    listing = db.get(Listing, listing_id)
    if listing is None or (listing.status == ListingStatus.hidden and (not viewer or viewer.id != listing.owner_id)):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Listing not found")
    return listing_out(listing, viewer)


@router.post("", response_model=ListingOut, status_code=201)
def create(
    body: ListingIn,
    user: User = Depends(require_roles(Role.seller, Role.broker)),
    db: Session = Depends(get_db),
):
    listing = Listing(owner_id=user.id, **body.model_dump())
    db.add(listing)
    db.commit()
    db.refresh(listing)
    return listing_out(listing, user)


@router.patch("/{listing_id}", response_model=ListingOut)
def update(listing_id: int, body: ListingUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    listing = _get_owned(db, listing_id, user)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(listing, field, value)
    db.commit()
    db.refresh(listing)
    return listing_out(listing, user)


@router.delete("/{listing_id}", status_code=204)
def delete(listing_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.delete(_get_owned(db, listing_id, user))
    db.commit()


@router.post("/{listing_id}/images", response_model=ListingOut, status_code=201)
def add_image(listing_id: int, body: ImageIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    listing = _get_owned(db, listing_id, user)
    if len(listing.images) >= MAX_IMAGES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"A listing can have at most {MAX_IMAGES} photos")
    try:
        data = base64.b64decode(body.data_base64, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Photo data is not valid base64")
    if len(data) > get_settings().max_image_bytes:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Photo is too large (max 2 MB)")
    listing.images.append(ListingImage(content_type=body.content_type, data=data, position=len(listing.images)))
    db.commit()
    db.refresh(listing)
    return listing_out(listing, user)


@router.delete("/{listing_id}/images/{image_id}", response_model=ListingOut)
def remove_image(listing_id: int, image_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    listing = _get_owned(db, listing_id, user)
    image = next((img for img in listing.images if img.id == image_id), None)
    if image is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Photo not found")
    listing.images.remove(image)
    for i, img in enumerate(listing.images):
        img.position = i
    db.commit()
    db.refresh(listing)
    return listing_out(listing, user)


images_router = APIRouter(tags=["listings"])


@images_router.get("/images/{image_id}")
def image(image_id: int, db: Session = Depends(get_db)):
    img = db.get(ListingImage, image_id)
    if img is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Photo not found")
    return Response(content=img.data, media_type=img.content_type, headers={"Cache-Control": "public, max-age=86400"})
