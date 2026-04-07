"""Bearer token authentication for musu-worker.

Token is read from MUSU_WORKER_TOKEN env var.
If the env var is unset the server runs in open mode (useful for local dev).
"""

from __future__ import annotations

import os

from fastapi import HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

_bearer = HTTPBearer(auto_error=False)


def get_token() -> str | None:
    return os.environ.get("MUSU_WORKER_TOKEN")


async def require_auth(
    credentials: HTTPAuthorizationCredentials | None = Security(_bearer),
) -> None:
    """FastAPI dependency — raises 401 when token is wrong."""
    token = get_token()
    if token is None:
        # No token configured → open mode (dev / Tailscale-trusted network)
        return
    if credentials is None or credentials.credentials != token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing Bearer token",
        )
