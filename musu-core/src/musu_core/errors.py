from typing import Any, Optional


class MusuError(Exception):
    """Base error for all MUSU services."""

    status_code: int = 500
    code: str = "internal_error"

    def __init__(self, message: str, details: Optional[Any] = None):
        super().__init__(message)
        self.message = message
        self.details = details

    def to_dict(self) -> dict:
        d = {"error": self.message, "code": self.code}
        if self.details is not None:
            d["details"] = self.details
        return d


class BadRequest(MusuError):
    status_code = 400
    code = "bad_request"


class Unauthorized(MusuError):
    status_code = 401
    code = "unauthorized"

    def __init__(self, message: str = "Unauthorized", details: Optional[Any] = None):
        super().__init__(message, details)


class Forbidden(MusuError):
    status_code = 403
    code = "forbidden"

    def __init__(self, message: str = "Forbidden", details: Optional[Any] = None):
        super().__init__(message, details)


class NotFound(MusuError):
    status_code = 404
    code = "not_found"

    def __init__(self, message: str = "Not found", details: Optional[Any] = None):
        super().__init__(message, details)


class Conflict(MusuError):
    status_code = 409
    code = "conflict"


class RateLimited(MusuError):
    status_code = 429
    code = "rate_limited"

    def __init__(self, message: str = "Rate limit exceeded", details: Optional[Any] = None):
        super().__init__(message, details)


class AdapterError(MusuError):
    status_code = 502
    code = "adapter_error"
