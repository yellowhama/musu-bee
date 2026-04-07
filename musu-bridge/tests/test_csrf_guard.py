"""Tests for CSRFOriginGuard middleware."""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from csrf_guard import CSRFOriginGuard, ALLOWED_ORIGINS


@pytest.fixture()
def app() -> FastAPI:
    test_app = FastAPI()
    test_app.add_middleware(CSRFOriginGuard)

    @test_app.post("/mutate")
    async def mutate():
        return {"ok": True}

    @test_app.get("/read")
    async def read():
        return {"ok": True}

    return test_app


@pytest.fixture()
def client(app: FastAPI) -> TestClient:
    return TestClient(app, raise_server_exceptions=False)


class TestCSRFOriginGuard:
    def test_allowed_origin_passes(self, client: TestClient) -> None:
        response = client.post("/mutate", headers={"Origin": ALLOWED_ORIGINS[0]})
        assert response.status_code == 200

    def test_unknown_origin_rejected(self, client: TestClient) -> None:
        response = client.post("/mutate", headers={"Origin": "https://evil.example.com"})
        assert response.status_code == 403
        assert "CSRF" in response.json().get("detail", "")

    def test_no_origin_header_passes(self, client: TestClient) -> None:
        """Server-to-server / CLI requests without Origin header are allowed."""
        response = client.post("/mutate")
        assert response.status_code == 200

    def test_get_request_not_checked(self, client: TestClient) -> None:
        """Safe methods are never blocked by CSRF guard."""
        response = client.get("/read", headers={"Origin": "https://evil.example.com"})
        assert response.status_code == 200

    def test_localhost_allowed(self, client: TestClient) -> None:
        response = client.post("/mutate", headers={"Origin": "http://localhost:3001"})
        assert response.status_code == 200

    def test_referer_header_used_as_fallback(self, client: TestClient) -> None:
        response = client.post(
            "/mutate",
            headers={"Referer": "https://evil.example.com/page"},
        )
        assert response.status_code == 403
