"""Demo accounts and listings so reviewers can try the app without setup.

All demo accounts use the password in DEMO_PASSWORD. Seeding only runs on an
empty database.
"""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .auth import hash_password
from .models import CallPolicy, LandType, Listing, Role, User

DEMO_PASSWORD = "Demo@1234"

USERS = [
    ("Asha (Buyer)", "buyer@landconnect.demo", Role.buyer, "Looking for farmland near Bengaluru"),
    ("Ravi (Seller)", "seller@landconnect.demo", Role.seller, "Selling family land in Karnataka"),
    ("Meera (Broker)", "broker@landconnect.demo", Role.broker, "Licensed land broker, Bengaluru & Mysuru"),
]

LISTINGS = [
    # owner email, title, description, price, sqft, type, city, address, lat, lng, exact
    ("seller@landconnect.demo", "2-acre mango orchard, Devanahalli",
     "Fenced orchard with 120 mature mango trees, borewell and 3-phase power. Clear title, ready for registration.",
     18500000, 87120, LandType.agricultural, "Devanahalli", "Survey No. 41, Avathi Road", 13.2468, 77.7121, True),
    ("seller@landconnect.demo", "Corner residential plot, Whitefield",
     "40x60 BBMP A-khata plot on a 40 ft road, 600 m from the metro. East facing.",
     9600000, 2400, LandType.residential, "Bengaluru", "Hagadur Main Road, Whitefield", 12.9837, 77.7520, False),
    ("broker@landconnect.demo", "Highway-facing commercial land, Mysuru Road",
     "1 acre with 200 ft frontage on the Bengaluru-Mysuru expressway service road. Suits a showroom or warehouse.",
     42000000, 43560, LandType.commercial, "Ramanagara", "NH-275 service road, Bidadi", 12.7979, 77.3916, True),
    ("broker@landconnect.demo", "Coffee estate parcel, Chikmagalur",
     "5 acres of shade-grown Arabica with a small workers' cottage and stream on the boundary.",
     31000000, 217800, LandType.agricultural, "Chikmagalur", "Mullayanagiri Road", 13.3896, 75.7420, False),
    ("broker@landconnect.demo", "Industrial plot in KIADB, Hosur Road",
     "Ready KIADB allotment with approved layout, water and power connections in place.",
     27500000, 21780, LandType.industrial, "Bengaluru", "KIADB Industrial Area, Attibele", 12.7781, 77.7710, True),
]


def seed_demo_data(db: Session) -> None:
    if db.scalar(select(func.count(User.id))):
        return
    by_email: dict[str, User] = {}
    for name, email, role, about in USERS:
        user = User(
            name=name,
            email=email,
            role=role,
            about=about,
            password_hash=hash_password(DEMO_PASSWORD),
            call_policy=CallPolicy.everyone,
        )
        db.add(user)
        by_email[email] = user
    db.flush()
    for owner, title, desc, price, sqft, kind, city, address, lat, lng, exact in LISTINGS:
        db.add(
            Listing(
                owner_id=by_email[owner].id,
                title=title,
                description=desc,
                price=price,
                area_sqft=sqft,
                land_type=kind,
                city=city,
                address=address,
                lat=lat,
                lng=lng,
                show_exact_location=exact,
            )
        )
    db.commit()
