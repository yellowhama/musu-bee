"""Hostname guard middleware for musu-bridge.

Rejects requests whose Host header is not in the allowed list.
Protects against DNS rebinding attacks and unintended exposure.

Allowed hosts are configured via MUSU_BRIDGE_ALLOWED_HOSTS env var
(comma-separated). Defaults permissively to allow localhost + Tailscale.
"""
from __future__ import annotations

import os

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

_DEFAULT_ALLOWED: list[str] = [
    "localhost",
    "127.0.0.1",
    "musu.pro",
]

# Tailscale CGNAT range prefix — 100.x.x.x hosts are always allowed
_TAILSCALE_PREFIX = "100."


def _build_allowed_set() -> frozenset[str]:
    raw = os.environ.get("MUSU_BRIDGE_ALLOWED_HOSTS", "")
    extra = [h.strip().lower() for h in raw.split(",") if h.strip()]
    return frozenset(h.lower() for h in _DEFAULT_ALLOWED + extra)


def _host_allowed(host_header: str, allowed: frozenset[str]) -> bool:
    """Check if a Host header value is permitted.

    Only domain-name hosts (containing a dot) participate in DNS rebinding
    attacks. Bare hostnames (no dot), IP addresses, and localhost variants
    are always safe and are allowed through.
    """
    # Strip port suffix if present
    host = host_header.split(":")[0].strip().lower()

    if not host:
        return False

    if host in allowed:
        return True

    # Bare hostname (no dot) — not a DNS rebinding vector, allow
    if "." not in host:
        return True

    # Allow numeric IPv4 addresses
    parts = host.split(".")
    if len(parts) == 4:
        try:
            octets = [int(p) for p in parts]
            if all(0 <= o <= 255 for o in octets):
                return True
        except ValueError:
            pass

    # Allow all Tailscale CGNAT addresses (100.64.0.0/10)
    if host.startswith(_TAILSCALE_PREFIX) and len(parts) == 4:
        try:
            second = int(parts[1])
            if 64 <= second <= 127:
                return True
        except ValueError:
            pass

    return False


class HostnameGuard(BaseHTTPMiddleware):
    """Reject requests with an unrecognised Host header."""

    def __init__(self, app, *, strict: bool = False) -> None:
        super().__init__(app)
        self._strict = strict
        self._allowed = _build_allowed_set()

    async def dispatch(self, request: Request, call_next):
        host_header = request.headers.get("host", "")

        # Health check is always allowed (internal monitoring)
        if request.url.path == "/health":
            return await call_next(request)

        if host_header and not _host_allowed(host_header, self._allowed):
            return JSONResponse(
                status_code=400,
                content={"detail": f"Host not allowed: {host_header.split(':')[0]}"},
            )

        return await call_next(request)
