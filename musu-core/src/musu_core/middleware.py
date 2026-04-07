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

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from musu_core.errors import MusuError, Unauthorized

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


def require_bearer_token(token: str) -> type:
    """Return a Starlette middleware class that validates a static Bearer token.

    Requests to /health bypass auth.  All other requests must supply the
    correct ``Authorization: Bearer <token>`` header or receive 401.
    """

    class AuthMiddleware(BaseHTTPMiddleware):
        async def dispatch(self, request: Request, call_next):
            if request.url.path == "/health":
                return await call_next(request)
            auth = request.headers.get("Authorization", "")
            if not auth.startswith("Bearer ") or auth[len("Bearer "):] != token:
                raise Unauthorized()
            return await call_next(request)

    return AuthMiddleware


def apply_musu_middlewares(app: FastAPI, bearer_token: str | None = None) -> None:
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
    app.add_middleware(ErrorHandlerMiddleware)
    app.add_middleware(RequestLoggerMiddleware)
