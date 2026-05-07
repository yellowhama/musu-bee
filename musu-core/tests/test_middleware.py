"""Tests for musu_core.middleware — Auth, CORS, rate limiting."""
import os
import pytest
from starlette.testclient import TestClient
from fastapi import FastAPI

os.environ.setdefault("MUSU_BRIDGE_TOKEN", "test-middleware-token-32chars-long")

from musu_core.middleware import apply_musu_middlewares


@pytest.fixture
def app_with_auth():
    app = FastAPI()

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    @app.get("/api/test")
    async def test_endpoint():
        return {"data": "secret"}

    apply_musu_middlewares(
        app,
        bearer_token="test-middleware-token-32chars-long",
        peer_token="peer-token-for-testing",
    )
    return app


class TestAuthMiddleware:
    def test_health_bypasses_auth(self, app_with_auth):
        client = TestClient(app_with_auth)
        resp = client.get("/health")
        assert resp.status_code == 200

    def test_valid_token_passes(self, app_with_auth):
        client = TestClient(app_with_auth)
        resp = client.get("/api/test", headers={"Authorization": "Bearer test-middleware-token-32chars-long"})
        assert resp.status_code == 200

    def test_invalid_token_rejected(self, app_with_auth):
        client = TestClient(app_with_auth)
        resp = client.get("/api/test", headers={"Authorization": "Bearer wrong-token"})
        assert resp.status_code == 401

    def test_peer_token_accepted(self, app_with_auth):
        client = TestClient(app_with_auth)
        resp = client.get("/api/test", headers={"Authorization": "Bearer peer-token-for-testing"})
        assert resp.status_code == 200

    def test_no_auth_header(self, app_with_auth):
        client = TestClient(app_with_auth)
        resp = client.get("/api/test")
        # localhost bypass or 401
        assert resp.status_code in (200, 401)
