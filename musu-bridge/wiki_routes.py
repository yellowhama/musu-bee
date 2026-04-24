"""Wiki CRUD routes for musu-bridge.

Extracted from server.py. Provides list, search, read, write, delete
for the LLM wiki at MUSU_WIKI_PATH.
"""
from __future__ import annotations

import os
import re as _re
from pathlib import Path as _Path

from fastapi import APIRouter, Body, HTTPException, Path, Query
from pydantic import BaseModel

_WIKI_PATH = _Path(os.environ.get("MUSU_WIKI_PATH", str(_Path.home() / "llm-wiki" / "wiki")))
_WIKI_PATH.mkdir(parents=True, exist_ok=True)

wiki_router = APIRouter(tags=["wiki"])


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


@wiki_router.get("/api/wiki/search", summary="Search wiki pages")
async def api_wiki_search(q: str = Query("", max_length=200)) -> list[dict]:
    q_str = q.strip().lower()
    if not q_str:
        return []
    results = []
    for f, folder in _iter_wiki_files():
        try:
            content = f.read_text(encoding="utf-8")
        except OSError:
            continue
        if q_str in content.lower():
            idx = content.lower().find(q_str)
            start = max(0, idx - 120)
            end = min(len(content), idx + 300)
            snippet = content[start:end].replace("\n", " ").strip()
            title = _wiki_title(content, f.stem)
            page_id = f"{folder}/{f.stem}" if folder else f.stem
            results.append({"id": page_id, "title": title, "folder": folder, "snippet": snippet})
    return results[:20]


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
