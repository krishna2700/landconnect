from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..auth import create_token, current_user, hash_password, verify_password
from ..db import get_db
from ..models import User
from ..schemas import AuthOut, LoginIn, MeOut, MeUpdate, PublicUser, RegisterIn

router = APIRouter(tags=["users"])


@router.post("/auth/register", response_model=AuthOut, status_code=201)
def register(body: RegisterIn, db: Session = Depends(get_db)):
    user = User(
        name=body.name.strip(),
        email=body.email.lower(),
        phone=body.phone,
        password_hash=hash_password(body.password),
        role=body.role,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")
    return AuthOut(token=create_token(user.id), user=MeOut.model_validate(user))


@router.post("/auth/login", response_model=AuthOut)
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.scalars(select(User).where(User.email == body.email.lower())).first()
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong email or password")
    return AuthOut(token=create_token(user.id), user=MeOut.model_validate(user))


@router.get("/me", response_model=MeOut)
def me(user: User = Depends(current_user)):
    return user


@router.patch("/me", response_model=MeOut)
def update_me(body: MeUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    db.commit()
    return user


@router.get("/users/{user_id}", response_model=PublicUser)
def public_profile(user_id: int, _: User = Depends(current_user), db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return user


@router.get("/users", response_model=list[PublicUser])
def search_users(q: str = "", me: User = Depends(current_user), db: Session = Depends(get_db)):
    """Find people to invite to a meeting room. Matches on name only; emails are never searchable."""
    stmt = select(User).where(User.id != me.id).order_by(User.name).limit(20)
    if q.strip():
        stmt = stmt.where(User.name.ilike(f"%{q.strip()}%"))
    return db.scalars(stmt).all()
