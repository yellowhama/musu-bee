"""test_wiki_html_render.py — V23.5 W-3 server-side HTML render.

Covers:
  - happy path: global scope (no company_id)
  - company scope: routed under companies/<id[:8]>/
  - 404: missing page_id
  - 503: markdown lib unavailable (monkey-patched ImportError)
  - 503: wiki path not readable (monkey-patched os.access)
  - GFM subset (table, fenced code, hard line break) renders correctly
"""
from __future__ import annotations

import builtins
import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def html_client(tmp_path, monkeypatch):
    """TestClient with isolated _WIKI_BASE pointed at tmp_path/llm-wiki.

    Creates both global/ and a sample company dir so get_wiki_path() can
    resolve either scope. Legacy _WIKI_PATH is left alone (separate site).
    """
    base = tmp_path / "llm-wiki"
    (base / "global").mkdir(parents=True)
    (base / "companies" / "abcdef12").mkdir(parents=True)

    import wiki_routes
    monkeypatch.setattr(wiki_routes, "_WIKI_BASE", base)

    import server as srv
    token = os.environ.get("MUSU_BRIDGE_TOKEN", "test-token")
    client = TestClient(srv.app, headers={"Authorization": f"Bearer {token}"}, raise_server_exceptions=True)
    # Expose paths for tests to seed content directly
    client.global_dir = base / "global"
    client.company_dir = base / "companies" / "abcdef12"
    return client


# ────────────────────────────────────────────────────────────────────────────
# Happy path — global scope
# ────────────────────────────────────────────────────────────────────────────

def test_html_render_global_scope(html_client):
    (html_client.global_dir / "hello.md").write_text(
        "# Hello\n\nFirst paragraph.\n", encoding="utf-8"
    )

    r = html_client.get("/api/wiki/page/hello/html")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["page_id"] == "hello"
    assert data["title"] == "Hello"
    assert "<h1>Hello</h1>" in data["html"]
    assert "<p>First paragraph.</p>" in data["html"]
    assert data["source_markdown"].startswith("# Hello")
    assert data["scope"] == "global"
    assert data["updated_at"]  # ISO 8601 non-empty


# ────────────────────────────────────────────────────────────────────────────
# Company scope
# ────────────────────────────────────────────────────────────────────────────

def test_html_render_company_scope(html_client):
    (html_client.company_dir / "spec.md").write_text(
        "# Spec\n\nCompany scoped.\n", encoding="utf-8"
    )

    r = html_client.get("/api/wiki/page/spec/html?company_id=abcdef12345678")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["page_id"] == "spec"
    assert data["scope"] == "company:abcdef12"
    assert "<h1>Spec</h1>" in data["html"]
    assert "Company scoped." in data["html"]


def test_html_render_company_missing_falls_back_to_global(html_client):
    """company_id pointing at non-existent dir → fall back to global per helper."""
    (html_client.global_dir / "fallback.md").write_text(
        "# Fallback\n\nglobal answer.\n", encoding="utf-8"
    )

    r = html_client.get("/api/wiki/page/fallback/html?company_id=zzzzzzzz")
    assert r.status_code == 200
    assert r.json()["scope"] == "global"


# ────────────────────────────────────────────────────────────────────────────
# 404 paths
# ────────────────────────────────────────────────────────────────────────────

def test_html_render_404_missing_page(html_client):
    r = html_client.get("/api/wiki/page/nonexistent-zzz/html")
    assert r.status_code == 404
    assert "not found" in r.json()["detail"].lower()


# ────────────────────────────────────────────────────────────────────────────
# 503 — markdown lib unavailable
# ────────────────────────────────────────────────────────────────────────────

def test_html_render_503_markdown_unavailable(html_client, monkeypatch):
    (html_client.global_dir / "x.md").write_text("# X\n", encoding="utf-8")

    real_import = builtins.__import__

    def fake_import(name, globals=None, locals=None, fromlist=(), level=0):
        if name == "markdown":
            raise ImportError("simulated: markdown not installed")
        return real_import(name, globals, locals, fromlist, level)

    monkeypatch.setattr(builtins, "__import__", fake_import)

    r = html_client.get("/api/wiki/page/x/html")
    assert r.status_code == 503
    assert r.json()["detail"] == "markdown_lib_unavailable"


# ────────────────────────────────────────────────────────────────────────────
# 503 — filesystem read-only / inaccessible
# ────────────────────────────────────────────────────────────────────────────

def test_html_render_503_path_not_readable(html_client, monkeypatch):
    (html_client.global_dir / "y.md").write_text("# Y\n", encoding="utf-8")

    import os as _os
    real_access = _os.access

    def fake_access(path, mode):
        # Block read on the global scope dir
        if str(path) == str(html_client.global_dir) and mode == _os.R_OK:
            return False
        return real_access(path, mode)

    import wiki_routes
    monkeypatch.setattr(wiki_routes.os, "access", fake_access)

    r = html_client.get("/api/wiki/page/y/html")
    assert r.status_code == 503
    assert r.json()["detail"] == "wiki_path_read_only"


# ────────────────────────────────────────────────────────────────────────────
# GFM subset rendering (table, fenced code, hard line break)
# ────────────────────────────────────────────────────────────────────────────

def test_html_render_gfm_table(html_client):
    md = (
        "# Tbl\n\n"
        "| H1 | H2 |\n"
        "|----|----|\n"
        "| a  | b  |\n"
    )
    (html_client.global_dir / "tbl.md").write_text(md, encoding="utf-8")

    r = html_client.get("/api/wiki/page/tbl/html")
    assert r.status_code == 200
    html = r.json()["html"]
    assert "<table>" in html
    assert "<th>H1</th>" in html
    assert "<td>a</td>" in html


def test_html_render_gfm_fenced_code(html_client):
    md = (
        "# Code\n\n"
        "```python\n"
        "print('hi')\n"
        "```\n"
    )
    (html_client.global_dir / "code.md").write_text(md, encoding="utf-8")

    r = html_client.get("/api/wiki/page/code/html")
    assert r.status_code == 200
    html = r.json()["html"]
    # python-markdown fenced_code emits <pre><code ...> with language class
    assert "<pre>" in html
    assert "<code" in html
    assert "print(&#39;hi&#39;)" in html or "print('hi')" in html


def test_html_render_gfm_hard_linebreak(html_client):
    md = "line one\nline two\n"
    (html_client.global_dir / "lb.md").write_text(md, encoding="utf-8")

    r = html_client.get("/api/wiki/page/lb/html")
    assert r.status_code == 200
    html = r.json()["html"]
    # nl2br: single \n becomes <br> inside paragraph
    assert "<br" in html
    assert "line one" in html and "line two" in html
