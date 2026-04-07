"""Bearer token authentication for musu-worker.

Token is read from MUSU_WORKER_TOKEN env var.
If the env var is unset the server runs in open mode (useful for local dev).
"""

from __future__ import annotations

import logging
import os

from fastapi import HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

_logger = logging.getLogger(__name__)
_bearer = HTTPBearer(auto_error=False)


def warn_if_open_mode() -> None:
    """Emit a loud warning if MUSU_WORKER_TOKEN is not set.

    Call this once at server startup.  Open mode means every endpoint is
    unauthenticated — safe only on a trusted network (e.g. Tailscale).
    """
    if os.environ.get("MUSU_WORKER_TOKEN") is None:
        _logger.warning(
            "MUSU_WORKER_TOKEN is not set — server is running in OPEN AUTH MODE. "
            "All endpoints are unauthenticated. "
            "Set MUSU_WORKER_TOKEN before deploying beyond a trusted (Tailscale) network."
        )


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
