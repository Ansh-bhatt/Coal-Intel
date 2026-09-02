"""User schemas — mirror lib/types.ts SessionUser shape."""

from pydantic import BaseModel, EmailStr, ConfigDict


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    email: EmailStr
    role: str
    subsidiary: str | None = None
    coalfield: str | None = None


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str = "SUBSIDIARY"
    subsidiary_id: int | None = None
    coalfield_id: int | None = None
