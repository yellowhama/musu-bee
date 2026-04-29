"""Wiki CRUD routes for musu-bridge.

Extracted from server.py. Provides list, search, read, write, delete
for the LLM wiki at MUSU_WIKI_PATH.

Search uses SQLite FTS5 for ranked full-text search.
"""
from __future__ import annotations

import logging
import os
import re as _re
import sqlite3
import threading
from pathlib import Path as _Path

from fastapi import APIRouter, Body, HTTPException, Path, Query
from pydantic import BaseModel

logger = logging.getLogger("musu.wiki")

_WIKI_BASE = _Path(os.environ.get("MUSU_WIKI_BASE", str(_Path.home() / "llm-wiki")))
# Legacy compat: old _WIKI_PATH still works as default for global
_WIKI_PATH = _WIKI_BASE / "companies" / "f27a9bd2"  # musu_corp default
_WIKI_PATH.mkdir(parents=True, exist_ok=True)
(_WIKI_BASE / "global").mkdir(parents=True, exist_ok=True)


def get_wiki_path(company_id: str | None = None) -> _Path:
    """Return wiki directory for a company. Falls back to global."""
    if company_id:
        company_dir = _WIKI_BASE / "companies" / company_id[:8]
        if company_dir.exists():
            return company_dir
    return _WIKI_BASE / "global"


wiki_router = APIRouter(tags=["wiki"])

# ── FTS5 Index ──────────────────────────────────────────────────
_FTS_DB_PATH = _WIKI_BASE / "wiki_fts.db"
_fts_lock = threading.Lock()
_fts_conn: sqlite3.Connection | None = None


def _get_fts_conn() -> sqlite3.Connection:
    global _fts_conn
    if _fts_conn is None:
        _fts_conn = sqlite3.connect(str(_FTS_DB_PATH), check_same_thread=False)
        _fts_conn.row_factory = sqlite3.Row
        _fts_conn.executescript("""
            CREATE VIRTUAL TABLE IF NOT EXISTS wiki_fts USING fts5(
                page_id, title, content, folder,
                tokenize='unicode61'
            );
        """)
    return _fts_conn


def _iter_company_wiki_files(wiki_dir: _Path):
    """Yield (file_path, folder) for .md files in a wiki directory."""
    if not wiki_dir.exists():
        return
    for f in sorted(wiki_dir.glob("*.md")):
        yield f, ""
    for d in sorted(p for p in wiki_dir.iterdir() if p.is_dir() and not p.name.startswith(".")):
        for f in sorted(d.glob("*.md")):
            yield f, d.name


def _rebuild_fts_index():
    """Rebuild FTS index from all company + global wiki files."""
    with _fts_lock:
        conn = _get_fts_conn()
        conn.execute("DELETE FROM wiki_fts")
        count = 0
        # Index all companies + global
        dirs_to_index: list[tuple[_Path, str]] = [(_WIKI_BASE / "global", "global")]
        companies_dir = _WIKI_BASE / "companies"
        if companies_dir.exists():
            for d in sorted(companies_dir.iterdir()):
                if d.is_dir() or d.is_symlink():
                    dirs_to_index.append((d, d.name))
        for wiki_dir, scope in dirs_to_index:
            for f, folder in _iter_company_wiki_files(wiki_dir):
                try:
                    content = f.read_text(encoding="utf-8")
                    title = _wiki_title(content, f.stem)
                    page_id = f"{folder}/{f.stem}" if folder else f.stem
                    conn.execute(
                        "INSERT INTO wiki_fts (page_id, title, content, folder) VALUES (?, ?, ?, ?)",
                        (f"{scope}:{page_id}", title, content, scope),
                    )
                    count += 1
                except OSError:
                    continue
        conn.commit()
        logger.info("wiki_fts: indexed %d pages across %d scopes", count, len(dirs_to_index))


# Build index on import (lazy — first search triggers if needed)
_fts_indexed = False


def _wiki_title(content: str, fallback: str) -> str:
    for line in content.split("\n"):
        if line.startswith("# "):
            return line[2:].strip()
    return fallback


def _iter_wiki_files():
    """Yield (file_path, folder_name) for all .md files, top-level and one level deep."""
    for f in sorted(_WIKI_PATH.glob("*.md")):
        yield f, ""
    for d in sorted(p for p in _WIKI_PATH.iterdir() if p.is_dir() and not p.name.startswith(".")):
        for f in sorted(d.glob("*.md")):
            yield f, d.name


@wiki_router.get("/api/wiki/pages", summary="List all wiki pages")
async def api_wiki_pages() -> list[dict]:
    pages = []
    for f, folder in _iter_wiki_files():
        try:
            content = f.read_text(encoding="utf-8")
            title = _wiki_title(content, f.stem)
        except OSError:
            title = f.stem
        page_id = f"{folder}/{f.stem}" if folder else f.stem
        pages.append({"id": page_id, "title": title, "folder": folder})
    return pages


@wiki_router.get("/api/wiki/search", summary="Search wiki pages (FTS5)")
async def api_wiki_search(q: str = Query("", max_length=200), company_id: str = Query("", max_length=64)) -> list[dict]:
    q_str = q.strip()
    if not q_str:
        return []

    # Lazy FTS index build
    global _fts_indexed
    if not _fts_indexed:
        _rebuild_fts_index()
        _fts_indexed = True

    results = []
    with _fts_lock:
        conn = _get_fts_conn()
        try:
            # FTS5 MATCH query with ranking
            rows = conn.execute(
                "SELECT page_id, title, snippet(wiki_fts, 2, '>>>', '<<<', '...', 40) as snippet, folder "
                "FROM wiki_fts WHERE wiki_fts MATCH ? ORDER BY rank LIMIT 20",
                (q_str,),
            ).fetchall()
            for r in rows:
                results.append({
                    "id": r["page_id"],
                    "title": r["title"],
                    "folder": r["folder"],
                    "snippet": r["snippet"].replace(">>>", "").replace("<<<", ""),
                })
        except sqlite3.OperationalError:
            # FTS parse error (e.g., special chars) — fallback to LIKE
            safe_q = f"%{q_str}%"
            rows = conn.execute(
                "SELECT page_id, title, substr(content, 1, 300) as snippet, folder "
                "FROM wiki_fts WHERE content LIKE ? LIMIT 20",
                (safe_q,),
            ).fetchall()
            for r in rows:
                results.append({
                    "id": r["page_id"],
                    "title": r["title"],
                    "folder": r["folder"],
                    "snippet": r["snippet"].replace("\n", " ").strip(),
                })
    return results


@wiki_router.get("/api/wiki/page/{page_id:path}", summary="Get a wiki page by ID")
async def api_wiki_page(page_id: str = Path(..., max_length=200)) -> dict:
    safe_id = _re.sub(r"[^a-zA-Z0-9_\-/]", "", page_id).strip("/").replace("//", "/")
    parts = safe_id.split("/", 1)
    if len(parts) == 2:
        folder, stem = parts
        path = _WIKI_PATH / folder / f"{stem}.md"
    else:
        path = _WIKI_PATH / f"{safe_id}.md"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Wiki page '{safe_id}' not found.")
    content = path.read_text(encoding="utf-8")
    return {"id": safe_id, "title": _wiki_title(content, safe_id.split("/")[-1]), "content": content}


class _WikiWriteRequest(BaseModel):
    content: str
    folder: str = ""


@wiki_router.post("/api/wiki/page/{page_id:path}", summary="Create or update a wiki page")
async def api_wiki_page_write(
    page_id: str = Path(..., max_length=200),
    body: _WikiWriteRequest = Body(...),
) -> dict:
    safe_id = _re.sub(r"[^a-zA-Z0-9_\-/]", "", page_id).strip("/").replace("//", "/")
    if not safe_id:
        raise HTTPException(status_code=400, detail="Invalid page ID")
    parts = safe_id.split("/", 1)
    if len(parts) == 2:
        folder, stem = parts
        dir_path = _WIKI_PATH / folder
    else:
        folder, stem = "", safe_id
        dir_path = _WIKI_PATH
    dir_path.mkdir(parents=True, exist_ok=True)
    path = dir_path / f"{stem}.md"
    path.write_text(body.content, encoding="utf-8")
    title = _wiki_title(body.content, stem)
    # Update FTS index for this page
    global _fts_indexed
    if _fts_indexed:
        with _fts_lock:
            conn = _get_fts_conn()
            conn.execute("DELETE FROM wiki_fts WHERE page_id = ?", (safe_id,))
            conn.execute(
                "INSERT INTO wiki_fts (page_id, title, content, folder) VALUES (?, ?, ?, ?)",
                (safe_id, title, body.content, folder),
            )
            conn.commit()
    return {"id": safe_id, "title": title, "folder": folder}


@wiki_router.delete("/api/wiki/page/{page_id:path}", summary="Delete a wiki page")
async def api_wiki_page_delete(
    page_id: str = Path(..., max_length=200),
) -> dict:
    safe_id = _re.sub(r"[^a-zA-Z0-9_\-/]", "", page_id).strip("/").replace("//", "/")
    parts = safe_id.split("/", 1)
    if len(parts) == 2:
        folder, stem = parts
        path = _WIKI_PATH / folder / f"{stem}.md"
    else:
        path = _WIKI_PATH / f"{safe_id}.md"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Wiki page '{safe_id}' not found.")
    path.unlink()
    return {"deleted": safe_id}
