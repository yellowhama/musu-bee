"""CSRF Origin guard for musu-bridge.

Validates Origin/Referer on state-mutating requests (POST, PUT, PATCH, DELETE).
Browser same-origin requests always include an Origin header; requests from
attacker-controlled pages will have a different origin and be rejected.
"""
from __future__ import annotations

import os as _os

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

_MUTATING_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})

# Populated from MUSU_BRIDGE_ALLOWED_ORIGINS env var (same as CORSMiddleware).
# Default covers dev + prod origins.
_default_csrf_origins = "https://musu.pro,http://localhost:3001,http://localhost:3000"
ALLOWED_ORIGINS: list[str] = [
    o.strip()
    for o in _os.getenv("MUSU_BRIDGE_ALLOWED_ORIGINS", _default_csrf_origins).split(",")
    if o.strip()
]


class CSRFOriginGuard(BaseHTTPMiddleware):
    """Reject mutating requests whose Origin/Referer is not in the allowlist."""

    async def dispatch(self, request: Request, call_next):
        if request.method in _MUTATING_METHODS:
            origin = request.headers.get("Origin") or ""
            referer = request.headers.get("Referer") or ""
            source = origin or referer

            # Allow requests with no origin header (server-to-server / curl / tests)
            # only when there is genuinely no browser context.
            if source and not any(source.startswith(o) for o in ALLOWED_ORIGINS):
                return JSONResponse(
                    status_code=403,
                    content={"detail": "CSRF: origin not allowed"},
                )

        return await call_next(request)
