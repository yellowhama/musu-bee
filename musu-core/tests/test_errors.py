import pytest

from musu_core.errors import (
    AdapterError,
    BadRequest,
    Conflict,
    Forbidden,
    MusuError,
    NotFound,
    RateLimited,
    Unauthorized,
)


def test_bad_request_to_dict():
    err = BadRequest("x")
    assert err.to_dict() == {"error": "x", "code": "bad_request"}


def test_bad_request_status_code():
    assert BadRequest("x").status_code == 400


def test_unauthorized_default_message():
    err = Unauthorized()
    assert err.message == "Unauthorized"
    assert err.status_code == 401


def test_not_found_default_message():
    err = NotFound()
    assert err.message == "Not found"
    assert err.status_code == 404


def test_rate_limited_status_code():
    err = RateLimited()
    assert err.status_code == 429


def test_adapter_error_code():
    assert AdapterError("oops").code == "adapter_error"
    assert AdapterError("oops").status_code == 502


def test_musu_error_is_superclass():
    for cls in [BadRequest, Unauthorized, Forbidden, NotFound, Conflict, RateLimited, AdapterError]:
        assert issubclass(cls, MusuError), f"{cls} should be subclass of MusuError"


def test_to_dict_with_details():
    err = BadRequest("bad input", details={"field": "name"})
    d = err.to_dict()
    assert d["details"] == {"field": "name"}
    assert d["error"] == "bad input"
    assert d["code"] == "bad_request"


def test_to_dict_no_details_key_absent():
    err = NotFound("resource missing")
    d = err.to_dict()
    assert "details" not in d


def test_raise_and_catch():
    with pytest.raises(MusuError) as exc_info:
        raise BadRequest("invalid param")
    assert exc_info.value.status_code == 400
    assert exc_info.value.code == "bad_request"
    assert "invalid param" in str(exc_info.value)


def test_forbidden_default_message():
    err = Forbidden()
    assert err.message == "Forbidden"
    assert err.status_code == 403


def test_conflict_status_and_code():
    err = Conflict("duplicate key")
    assert err.status_code == 409
    assert err.code == "conflict"
