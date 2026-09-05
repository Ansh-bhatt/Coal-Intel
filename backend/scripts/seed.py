"""Seed master data + demo users.

Run after ``alembic upgrade head``::

    python -m scripts.seed

The subsidiary/coalfield/category lists mirror the frontend's
``lib/mockData.ts`` (SUBSIDIARY_OPTIONS, COALFIELD_OPTIONS, CATEGORY_OPTIONS).
"""

import asyncio

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.db.session import async_session_factory
from app.models.subsidiary import Coalfield, Subsidiary
from app.models.user import User

# Keep in sync with lib/mockData.ts
SUBSIDIARY_CODES = {
    "Eastern Coalfields Ltd": "ECL",
    "Bharat Coking Coal Ltd": "BCCL",
    "Central Coalfields Ltd": "CCL",
    "Western Coalfields Ltd": "WCL",
    "South Eastern Coalfields Ltd": "SECL",
    "Northern Coalfields Ltd": "NCL",
    "Mahanadi Coalfields Ltd": "MCL",
}

COALFIELD_OWNERS = {
    "Talcher Coalfield": "Mahanadi Coalfields Ltd",
    "Ib Valley Coalfield": "Mahanadi Coalfields Ltd",
    "Jharia Coalfield": "Bharat Coking Coal Ltd",
    "Raniganj Coalfield": "Eastern Coalfields Ltd",
    "Bokaro Coalfield": "Central Coalfields Ltd",
    "Korba Coalfield": "South Eastern Coalfields Ltd",
    "Singrauli Coalfield": "Northern Coalfields Ltd",
    "Wardha Valley Coalfield": "Western Coalfields Ltd",
}

CATEGORIES = [
    "Production Statistics",
    "Overburden Removal",
    "Dispatch & Despatch",
    "Capital Expenditure",
    "Manpower & Safety",
    "Environmental Compliance",
]

# Demo users (password: Demo@1234)
DEMO_USERS = [
    {
        "name": "A. Bhattacharya",
        "email": "a.bhattacharya@cil.co.in",
        "password": "Demo@1234",
        "role": "EXECUTIVE",
    },
    {
        "name": "R. Verma",
        "email": "r.verma@mcl.co.in",
        "password": "Demo@1234",
        "role": "SUBSIDIARY",
        "subsidiary": "Mahanadi Coalfields Ltd",
        "coalfield": "Talcher Coalfield",
    },
    {
        "name": "S. Krishnan",
        "email": "s.krishnan@cil.co.in",
        "password": "Demo@1234",
        "role": "ADMIN",
    },
]


async def seed(session: AsyncSession) -> None:
    # Subsidiaries
    sub_by_name: dict[str, Subsidiary] = {}
    for name, code in SUBSIDIARY_CODES.items():
        existing = (
            await session.execute(select(Subsidiary).where(Subsidiary.name == name))
        ).scalar_one_or_none()
        if existing is None:
            sub = Subsidiary(name=name, code=code)
            session.add(sub)
            await session.flush()
            sub_by_name[name] = sub
        else:
            sub_by_name[name] = existing

    # Coalfields
    for name, owner in COALFIELD_OWNERS.items():
        owner_sub = sub_by_name[owner]
        existing = (
            await session.execute(
                select(Coalfield).where(
                    Coalfield.name == name, Coalfield.subsidiary_id == owner_sub.id
                )
            )
        ).scalar_one_or_none()
        if existing is None:
            session.add(Coalfield(name=name, subsidiary_id=owner_sub.id))

    # Users
    for u in DEMO_USERS:
        existing = (
            await session.execute(select(User).where(User.email == u["email"]))
        ).scalar_one_or_none()
        if existing is None:
            subsidiary_id = None
            coalfield_id = None
            if u.get("subsidiary"):
                subsidiary_id = sub_by_name[u["subsidiary"]].id
                coalfield = (
                    await session.execute(
                        select(Coalfield).where(
                            Coalfield.name == u["coalfield"],
                            Coalfield.subsidiary_id == subsidiary_id,
                        )
                    )
                ).scalar_one_or_none()
                if coalfield:
                    coalfield_id = coalfield.id
            session.add(
                User(
                    name=u["name"],
                    email=u["email"],
                    hashed_password=hash_password(u["password"]),
                    role=u["role"],
                    subsidiary_id=subsidiary_id,
                    coalfield_id=coalfield_id,
                )
            )

    await session.commit()
    print(
        f"Seed complete: {len(sub_by_name)} subsidiaries, "
        f"{len(COALFIELD_OWNERS)} coalfields, {len(DEMO_USERS)} demo users."
    )


async def main() -> None:
    async with async_session_factory() as session:
        await seed(session)


if __name__ == "__main__":
    asyncio.run(main())
