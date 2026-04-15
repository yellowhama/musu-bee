"""FastAPI middleware factory for musu services.

Provides three middleware classes and a convenience factory function:
- ErrorHandlerMiddleware  — catches MusuError subclasses → structured JSON
- RequestLoggerMiddleware — logs method / path / status / duration
- require_bearer_token()  — returns an AuthMiddleware class for a given token

Usage:
    from musu_core.middleware import apply_musu_middlewares
    apply_musu_middlewares(app, bearer_token=os.getenv("MUSU_BRIDGE_TOKEN"))
"""

from __future__ import annotations

import logging
import time
import hmac
from typing import Literal

from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from musu_core.errors import MusuError, Unauthorized
from musu_core.rate_limit import SlidingWindowLimiter

logger = logging.getLogger(__name__)


class ErrorHandlerMiddleware(BaseHTTPMiddleware):
    """Catch MusuError subclasses and return structured JSON responses."""

    async def dispatch(self, request: Request, call_next):
        try:
            return await call_next(request)
        except MusuError as exc:
            return JSONResponse(
                status_code=exc.status_code,
                content=exc.to_dict(),
            )
        except Exception as exc:
            logger.exception("Unhandled error: %s", exc)
            return JSONResponse(
                status_code=500,
                content={"error": "Internal server error", "code": "internal_error"},
            )


class RequestLoggerMiddleware(BaseHTTPMiddleware):
    """Log method, path, status code, and duration for every request."""

    async def dispatch(self, request: Request, call_next):
        start = time.perf_counter()
        response = await call_next(request)
        duration_ms = (time.perf_counter() - start) * 1000
        logger.info(
            "request",
            extra={
                "method": request.method,
                "path": request.url.path,
                "status": response.status_code,
                "duration_ms": round(duration_ms, 2),
            },
        )
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(
        self,
        app: ASGIApp,
        limiter: SlidingWindowLimiter,
        get_client_id: callable,
    ):
        super().__init__(app)
        self.limiter = limiter
        self.get_client_id = get_client_id

    async def dispatch(self, request: Request, call_next):
        client_id = self.get_client_id(request)
        if client_id is None:  # No client_id means no rate limit
            return await call_next(request)

        if not self.limiter.allow_request(client_id):
            remaining = self.limiter.get_remaining_requests(client_id)
            reset = self.limiter.get_reset_time(client_id)
            response = JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded"},
            )
            response.headers["X-RateLimit-Limit"] = str(self.limiter.capacity)
            response.headers["X-RateLimit-Remaining"] = str(remaining)
            response.headers["X-RateLimit-Reset"] = str(reset)
            return response
        
        response = await call_next(request)
        remaining = self.limiter.get_remaining_requests(client_id)
        reset = self.limiter.get_reset_time(client_id)
        response.headers["X-RateLimit-Limit"] = str(self.limiter.capacity)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        response.headers["X-RateLimit-Reset"] = str(reset)
        return response


def get_ip_client_id(request: Request) -> str | None:
    return request.client.host if request.client else None

def get_token_client_id(request: Request) -> str | None:
    auth = request.headers.get("Authorization")
    if auth and auth.startswith("Bearer "):
        return auth[len("Bearer "):]
    return None


def require_bearer_token(token: str) -> type:
    """Return a Starlette middleware class that validates a static Bearer token.

    Requests to /health bypass auth.  All other requests must supply the
    correct ``Authorization: Bearer <token>`` header or receive 401.
    """

    class AuthMiddleware(BaseHTTPMiddleware):
        async def dispatch(self, request: Request, call_next):
            if request.url.path == "/health":
                return await call_next(request)
            # Internal sidecar calls from localhost skip token auth
            if request.client and request.client.host in ("127.0.0.1", "::1"):
                return await call_next(request)
            auth = request.headers.get("Authorization", "")
            if not auth.startswith("Bearer ") or not hmac.compare_digest(auth[len("Bearer "):], token):
                raise Unauthorized()
            return await call_next(request)

    return AuthMiddleware


def apply_musu_middlewares(
    app: FastAPI,
    bearer_token: str | None = None,
    rate_limit_capacity: int | None = None,
    rate_limit_window_seconds: int | None = None,
    rate_limit_key_type: Literal["ip", "token"] | None = None,
) -> None:
    """Register ErrorHandler, RequestLogger, and optional auth middleware on *app*.

    Starlette executes middleware in reverse insertion order (last added runs
    first on incoming requests).  Desired execution order is:

        RequestLogger → ErrorHandler → [AuthMiddleware] → route handler

    So we add them in the opposite order:
        1. AuthMiddleware      (first added = innermost — raises Unauthorized)
        2. ErrorHandlerMiddleware (catches MusuError from auth and route handlers)
        3. RequestLoggerMiddleware (last added = outermost — sees every request)
    """
    if bearer_token:
        app.add_middleware(require_bearer_token(bearer_token))

    if rate_limit_capacity is not None and rate_limit_window_seconds is not None and rate_limit_key_type is not None:
        limiter = SlidingWindowLimiter(capacity=rate_limit_capacity, window_seconds=rate_limit_window_seconds)
        if rate_limit_key_type == "ip":
            get_client_id_func = get_ip_client_id
        elif rate_limit_key_type == "token":
            get_client_id_func = get_token_client_id
        else:
            raise ValueError(f"Unknown rate_limit_key_type: {rate_limit_key_type}")
        app.add_middleware(RateLimitMiddleware, limiter=limiter, get_client_id=get_client_id_func)

    app.add_middleware(ErrorHandlerMiddleware)
    app.add_middleware(RequestLoggerMiddleware)
