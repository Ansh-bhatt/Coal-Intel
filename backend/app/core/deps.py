"""FastAPI dependencies — session, auth, role guards."""

from collections.abc import AsyncGenerator
from typing import Any

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import decode_token
from app.db.session import async_session_factory
from app.models.user import User

settings = get_settings()
bearer_scheme = HTTPBearer(auto_error=False)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Yields a request-scoped async session."""
    async with async_session_factory() as session:
        yield session


async def get_current_user(
    token: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Resolve the JWT token to a User.

    Called by every protected route.  Raises 401 if the token is missing,
    invalid, or the user no longer exists.
    """
    if token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )
    try:
        payload: dict[str, Any] = decode_token(token.credentials)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    user_id: str | None = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    return user


def require_role(*roles: str):
    """Dependency factory — wraps ``get_current_user`` and checks the role.

    Usage::

        @router.get("/admin-only")
        async def admin_endpoint(user: User = Depends(require_role("ADMIN"))):
            ...
    """
    async def _role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return current_user
    return _role_checker