"""V23.5 C-1: api_company_briefing.recent_wiki_pages filesystem scan tests.

Validates the _scan_recent_wiki_pages helper:
- empty filesystem returns []
- 24h cutoff window (recent included, stale excluded)
- global + company-scoped pages
- 5-entry cap with newest-first ordering
- title extraction from `# Heading` markdown
- summary_excerpt extraction + 200-char cap
- graceful degrade on IO errors
"""
from __future__ import annotations

import os
import time
from pathlib import Path

import pytest


def _import_scanner(monkeypatch, base: Path):
    """Set MUSU_WIKI_BASE and return _scan_recent_wiki_pages from server."""
    monkeypatch.setenv("MUSU_WIKI_BASE", str(base))
    import sys
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
    from server import _scan_recent_wiki_pages  # noqa: WPS433
    return _scan_recent_wiki_pages


def _touch_md(path: Path, content: str, mtime: float | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    if mtime is not None:
        os.utime(path, (mtime, mtime))


# ── 1. Empty filesystem ──────────────────────────────────────────────────────

def test_empty_filesystem_returns_empty_list(tmp_path, monkeypatch):
    scan = _import_scanner(monkeypatch, tmp_path)
    result = scan("abcdef0123456789", max_entries=5, hours=24)
    assert result == []


# ── 2. Single global page within 24h ─────────────────────────────────────────

def test_single_global_page_recent(tmp_path, monkeypatch):
    scan = _import_scanner(monkeypatch, tmp_path)
    _touch_md(tmp_path / "global" / "policy.md", "# Policy Title\n\nBody text here.\n")
    result = scan("abcdef0123456789", max_entries=5, hours=24)
    assert len(result) == 1
    assert result[0]["page_id"] == "policy"
    assert result[0]["title"] == "Policy Title"
    assert result[0]["scope"] == "global"
    assert "Body text here." in result[0]["summary_excerpt"]
    assert result[0]["updated_at"].endswith("+00:00")


# ── 3. Single company page within 24h ────────────────────────────────────────

def test_single_company_page_recent(tmp_path, monkeypatch):
    scan = _import_scanner(monkeypatch, tmp_path)
    cid = "f27a9bd2deadbeef"  # 16+ chars; only [:8] is used for directory
    _touch_md(
        tmp_path / "companies" / cid[:8] / "spec.md",
        "# Company Spec\n\nWhat we do.\n",
    )
    result = scan(cid, max_entries=5, hours=24)
    assert len(result) == 1
    assert result[0]["page_id"] == "spec"
    assert result[0]["title"] == "Company Spec"
    assert result[0]["scope"] == f"company:{cid[:8]}"


# ── 4. 24h cutoff: stale page excluded ───────────────────────────────────────

def test_stale_page_excluded_by_cutoff(tmp_path, monkeypatch):
    scan = _import_scanner(monkeypatch, tmp_path)
    stale_mtime = time.time() - (25 * 3600)  # 25 hours ago
    _touch_md(
        tmp_path / "global" / "old.md",
        "# Old\n\nStale content.\n",
        mtime=stale_mtime,
    )
    # And one recent
    _touch_md(tmp_path / "global" / "new.md", "# New\n\nRecent content.\n")
    result = scan("abcdef0123456789", max_entries=5, hours=24)
    page_ids = [r["page_id"] for r in result]
    assert "new" in page_ids
    assert "old" not in page_ids


# ── 5. Cap at 5 entries, newest first ────────────────────────────────────────

def test_seven_pages_cap_at_five_newest_first(tmp_path, monkeypatch):
    scan = _import_scanner(monkeypatch, tmp_path)
    now = time.time()
    for i in range(7):
        # i=0 oldest, i=6 newest, all within last hour
        mtime = now - (7 - i) * 60  # spaced 60s apart
        _touch_md(
            tmp_path / "global" / f"page_{i}.md",
            f"# Page {i}\n\nContent {i}.\n",
            mtime=mtime,
        )
    result = scan("abcdef0123456789", max_entries=5, hours=24)
    assert len(result) == 5
    # Newest first: page_6, page_5, page_4, page_3, page_2
    page_ids = [r["page_id"] for r in result]
    assert page_ids == ["page_6", "page_5", "page_4", "page_3", "page_2"]


# ── 6. Title extraction + summary_excerpt 200-char cap ───────────────────────

def test_title_extraction_and_summary_200_cap(tmp_path, monkeypatch):
    scan = _import_scanner(monkeypatch, tmp_path)
    long_body = "x" * 500  # 500 chars
    _touch_md(
        tmp_path / "global" / "long.md",
        f"# Long Title\n\n{long_body}\n",
    )
    result = scan("abcdef0123456789", max_entries=5, hours=24)
    assert len(result) == 1
    assert result[0]["title"] == "Long Title"
    assert len(result[0]["summary_excerpt"]) == 200
    assert result[0]["summary_excerpt"] == "x" * 200


# ── 7. No `#` header → page_id used as title ─────────────────────────────────

def test_no_header_falls_back_to_page_id(tmp_path, monkeypatch):
    scan = _import_scanner(monkeypatch, tmp_path)
    _touch_md(tmp_path / "global" / "raw.md", "Just plain text, no header.\n")
    result = scan("abcdef0123456789", max_entries=5, hours=24)
    assert len(result) == 1
    assert result[0]["page_id"] == "raw"
    assert result[0]["title"] == "raw"
    assert "Just plain text" in result[0]["summary_excerpt"]


# ── 8. Both scopes returned together, newest-first across scopes ─────────────

def test_global_and_company_merged_newest_first(tmp_path, monkeypatch):
    scan = _import_scanner(monkeypatch, tmp_path)
    cid = "deadbeefcafebabe"
    now = time.time()
    _touch_md(
        tmp_path / "global" / "g.md",
        "# Global Page\n\nG content.\n",
        mtime=now - 120,  # older
    )
    _touch_md(
        tmp_path / "companies" / cid[:8] / "c.md",
        "# Company Page\n\nC content.\n",
        mtime=now - 30,  # newer
    )
    result = scan(cid, max_entries=5, hours=24)
    assert len(result) == 2
    assert result[0]["page_id"] == "c"
    assert result[0]["scope"] == f"company:{cid[:8]}"
    assert result[1]["page_id"] == "g"
    assert result[1]["scope"] == "global"


# ── 9. Graceful degrade: unreadable file (bad encoding) still produces entry ─

def test_unreadable_bytes_graceful_degrade(tmp_path, monkeypatch):
    scan = _import_scanner(monkeypatch, tmp_path)
    bad = tmp_path / "global" / "bad.md"
    bad.parent.mkdir(parents=True, exist_ok=True)
    # Write raw invalid UTF-8 bytes
    bad.write_bytes(b"\xff\xfe\xfd binary garbage \xc3\x28")
    result = scan("abcdef0123456789", max_entries=5, hours=24)
    # Should NOT crash; entry exists (errors='replace' tolerates bad bytes)
    assert len(result) == 1
    assert result[0]["page_id"] == "bad"


# ── 10. Empty company_id → only global scope scanned ─────────────────────────

def test_empty_company_id_scans_global_only(tmp_path, monkeypatch):
    scan = _import_scanner(monkeypatch, tmp_path)
    _touch_md(tmp_path / "global" / "g.md", "# Global\n\nContent.\n")
    # Even if a company dir somehow exists, empty cid should skip it
    _touch_md(tmp_path / "companies" / "abcdefgh" / "c.md", "# C\n\nC content.\n")
    result = scan("", max_entries=5, hours=24)
    page_ids = [r["page_id"] for r in result]
    assert "g" in page_ids
    assert "c" not in page_ids


# ── 11. Missing base dir → returns [] (no exception) ─────────────────────────

def test_missing_base_dir_returns_empty(tmp_path, monkeypatch):
    nonexistent = tmp_path / "does-not-exist"
    scan = _import_scanner(monkeypatch, nonexistent)
    result = scan("abcdef0123456789", max_entries=5, hours=24)
    assert result == []
