"""test_wiki.py — Wiki API 엔드포인트 단위 테스트 (Phase 56)."""
from __future__ import annotations

import os
import importlib
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Fixture: tmp_wiki_path
# ---------------------------------------------------------------------------

@pytest.fixture()
def wiki_client(tmp_path, monkeypatch):
    """TestClient with MUSU_WIKI_PATH pointed at a fresh tmpdir.

    Patches the module-level _WIKI_PATH in server so each test gets an
    isolated, empty wiki directory.
    """
    wiki_dir = tmp_path / "wiki"
    wiki_dir.mkdir()

    monkeypatch.setenv("MUSU_WIKI_PATH", str(wiki_dir))

    import server as srv; import wiki_routes
    monkeypatch.setattr(wiki_routes, "_WIKI_PATH", wiki_dir)

    token = os.environ.get("MUSU_BRIDGE_TOKEN", "test-token")
    client = TestClient(srv.app, headers={"Authorization": f"Bearer {token}"}, raise_server_exceptions=True)
    return client


# ---------------------------------------------------------------------------
# F56-02: POST write + GET read
# ---------------------------------------------------------------------------

def test_wiki_write_and_read(wiki_client):
    """POST 후 GET으로 동일 content 반환 확인."""
    payload = {"content": "# Hello World\n\nTest content here."}
    r = wiki_client.post("/api/wiki/page/hello-world", json=payload)
    assert r.status_code in (200, 201)
    data = r.json()
    assert data["id"] == "hello-world"
    assert "title" in data
    assert "folder" in data

    r2 = wiki_client.get("/api/wiki/page/hello-world")
    assert r2.status_code == 200
    data2 = r2.json()
    assert data2["id"] == "hello-world"
    assert "title" in data2
    assert data2["content"] == payload["content"]


def test_wiki_write_and_read_folder(wiki_client):
    """폴더 ID (ops/server-setup) POST/GET 동작 확인."""
    payload = {"content": "# Server Setup\n\nInstructions here."}
    r = wiki_client.post("/api/wiki/page/ops/server-setup", json=payload)
    assert r.status_code in (200, 201)
    data = r.json()
    assert data["id"] == "ops/server-setup"

    r2 = wiki_client.get("/api/wiki/page/ops/server-setup")
    assert r2.status_code == 200
    assert r2.json()["content"] == payload["content"]


# ---------------------------------------------------------------------------
# F56-03: LIST + SEARCH
# ---------------------------------------------------------------------------

def test_wiki_list(wiki_client):
    """페이지 2개 생성 후 GET /api/wiki/pages → 두 항목 모두 포함."""
    for page_id, title in [("page-a", "# Alpha"), ("page-b", "# Beta")]:
        wiki_client.post(f"/api/wiki/page/{page_id}", json={"content": f"{title}\n\nContent."})

    r = wiki_client.get("/api/wiki/pages")
    assert r.status_code == 200
    ids = [p["id"] for p in r.json()]
    assert "page-a" in ids
    assert "page-b" in ids


def test_wiki_search(wiki_client):
    """키워드 포함 페이지 검색 → snippet 필드 포함 반환."""
    wiki_client.post(
        "/api/wiki/page/quux-page",
        json={"content": "# Quux Page\n\nThis page contains XYZZY keyword."},
    )

    r = wiki_client.get("/api/wiki/search?q=XYZZY")
    assert r.status_code == 200
    results = r.json()
    assert len(results) >= 1
    assert any(item["id"] == "quux-page" for item in results)
    assert "snippet" in results[0]


def test_wiki_search_empty_query(wiki_client):
    """빈 검색어 → 빈 배열 반환."""
    r = wiki_client.get("/api/wiki/search?q=")
    assert r.status_code == 200
    assert r.json() == []


# ---------------------------------------------------------------------------
# F56-04: DELETE + 404 + invalid ID
# ---------------------------------------------------------------------------

def test_wiki_delete(wiki_client):
    """페이지 생성 후 DELETE → 200, 이후 GET → 404."""
    wiki_client.post("/api/wiki/page/to-delete", json={"content": "# Delete Me\n\nBye."})

    r_del = wiki_client.delete("/api/wiki/page/to-delete")
    assert r_del.status_code == 200

    r_get = wiki_client.get("/api/wiki/page/to-delete")
    assert r_get.status_code == 404


def test_wiki_get_not_found(wiki_client):
    """존재하지 않는 ID GET → 404."""
    r = wiki_client.get("/api/wiki/page/nonexistent-page-abc123")
    assert r.status_code == 404


def test_wiki_write_invalid_id(wiki_client):
    """빈 ID (특수문자만) POST → 400."""
    r = wiki_client.post("/api/wiki/page/!!!", json={"content": "# Bad\n\nContent."})
    assert r.status_code == 400
