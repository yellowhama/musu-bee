from __future__ import annotations

import os
import re
import sqlite3
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor
from fnmatch import fnmatch
from pathlib import Path

from .query_expander import QueryExpander
from .resolver import resolve_and_materialize
from .workspace import (
    CODE_EXTENSIONS,
    DOC_EXTENSIONS,
    find_project_root as resolve_project_root,
    matches_scope,
    resolve_workspace,
    should_index_path,
)

PACKAGE_ROOT = Path(__file__).parent
LINUX_BIN = str(PACKAGE_ROOT / "bin" / "musu-indexer-linux")
INDEX_VERSION = 2

DOC_BASENAMES = {
    "agents.md",
    "changelog.md",
    "claude.md",
    "contributing.md",
    "readme.md",
    "todo.md",
}

RS_PATTERNS = (
    (re.compile(r"^\s*(?:pub(?:\(.*\))?\s+)?fn\s+([a-zA-Z_]\w*)"), "function"),
    (re.compile(r"^\s*(?:pub(?:\(.*\))?\s+)?struct\s+([a-zA-Z_]\w*)"), "struct"),
    (re.compile(r"^\s*(?:pub(?:\(.*\))?\s+)?enum\s+([a-zA-Z_]\w*)"), "enum"),
    (re.compile(r"^\s*impl(?:\s+.*)?\s+([a-zA-Z_]\w*)"), "impl"),
)
TS_PATTERNS = (
    (
        re.compile(r"^\s*(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z_]\w*)"),
        "function",
    ),
    (re.compile(r"^\s*(?:export\s+)?class\s+([a-zA-Z_]\w*)"), "class"),
    (re.compile(r"^\s*(?:export\s+)?interface\s+([a-zA-Z_]\w*)"), "interface"),
)
PY_PATTERNS = (
    (re.compile(r"^\s*def\s+([a-zA-Z_]\w*)"), "function"),
    (re.compile(r"^\s*class\s+([a-zA-Z_]\w*)"), "class"),
)
GO_PATTERNS = (
    (
        re.compile(r"^\s*func\s+(?:\([^\)]+\)\s+)?([a-zA-Z_]\w*)"),
        "function",
    ),
    (re.compile(r"^\s*type\s+([a-zA-Z_]\w*)\s+struct"), "struct"),
    (re.compile(r"^\s*type\s+([a-zA-Z_]\w*)\s+interface"), "interface"),
)
MD_HEADER = re.compile(r"^(#{1,6})\s+(.*)$")
RESULT_ERROR_PREFIX = re.compile(r"^[a-z-]+ error:")


def _normalize_path(value: str) -> str:
    normalized = value.replace("\\", "/")
    while normalized.startswith("./"):
        normalized = normalized[2:]
    return normalized.lstrip("/")


def result_has_error(result: str) -> bool:
    return bool(RESULT_ERROR_PREFIX.match(result.strip().lower()))


def find_project_root(
    start_path: str = None,
    *,
    root_override: str = None,
    profile_path: str = None,
) -> Path:
    return resolve_project_root(
        start_path=start_path,
        root_override=root_override,
        profile_path=profile_path,
    )


def get_db(project_root: Path):
    db_path = str(project_root / ".musu_dev.db")
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA mmap_size=3000000000")
    return conn


def infer_category(rel_path: str) -> str:
    normalized = _normalize_path(rel_path).lower()
    path_obj = Path(normalized)
    basename = path_obj.name
    suffix = path_obj.suffix
    parts = set(path_obj.parts)

    if (
        normalized.startswith("references/")
        or normalized.startswith("references_ai/")
        or "reference" in parts
    ):
        return "reference"
    if "/logs/" in normalized or basename.endswith(".log"):
        return "log"
    if any(token in basename for token in ("report", "analysis", "audit", "review")):
        return "report"
    if any(token in basename for token in ("plan", "handoff", "roadmap")):
        return "plan"
    if (
        any(token in basename for token in ("spec", "contract", "requirement"))
        or basename in {"agents.md", "claude.md", "todo.md"}
    ):
        return "spec"
    if basename in {"package.json", "package-lock.json", "pyproject.toml", "go.mod", "go.sum"}:
        return "config"
    if suffix in {".json", ".toml", ".yaml", ".yml", ".ini", ".cfg", ".conf", ".env"}:
        return "config"
    if normalized.startswith("docs/") or basename in DOC_BASENAMES or suffix in DOC_EXTENSIONS:
        return "guide"
    return "code"


def _symbol_patterns_for_suffix(suffix: str):
    return {
        ".rs": RS_PATTERNS,
        ".ts": TS_PATTERNS,
        ".tsx": TS_PATTERNS,
        ".py": PY_PATTERNS,
        ".go": GO_PATTERNS,
    }.get(suffix, ())


def _parse_symbols_and_sections(rel_path: str, content: str) -> tuple[list[dict], list[dict]]:
    suffix = Path(rel_path).suffix.lower()
    symbols: list[dict] = []
    sections: list[dict] = []
    lines = content.splitlines()

    for index, line in enumerate(lines, start=1):
        for pattern, kind in _symbol_patterns_for_suffix(suffix):
            match = pattern.search(line)
            if match:
                symbols.append(
                    {
                        "name": match.group(1),
                        "kind": kind,
                        "line_start": index,
                        "signature": line.strip(),
                    }
                )

    if suffix == ".md":
        current = None
        for line in lines:
            match = MD_HEADER.match(line)
            if match:
                if current is not None:
                    sections.append(current)
                current = {
                    "title": match.group(2).strip(),
                    "level": len(match.group(1)),
                    "content": "",
                }
            elif current is not None:
                current["content"] += line + "\n"
        if current is not None:
            sections.append(current)

    return symbols, sections


def _write_index_rows(
    conn: sqlite3.Connection,
    rel_path: str,
    *,
    size: int,
    last_modified: float,
    category: str,
    content: str,
    symbols: list[dict],
    sections: list[dict],
) -> None:
    conn.execute(
        """
        INSERT OR REPLACE INTO files (path, size, last_modified, category, indexed_at)
        VALUES (?, ?, ?, ?, datetime('now'))
        """,
        (rel_path, size, last_modified, category),
    )
    conn.execute("DELETE FROM doc_sections WHERE file_path = ?", (rel_path,))
    conn.execute("DELETE FROM code_symbols WHERE file_path = ?", (rel_path,))
    conn.execute("DELETE FROM search_index WHERE path = ?", (rel_path,))

    short_content = content[:2000]
    conn.execute(
        "INSERT INTO search_index (path, title, content, type) VALUES (?, ?, ?, 'file')",
        (rel_path, rel_path, short_content),
    )

    for section in sections:
        conn.execute(
            """
            INSERT INTO doc_sections (file_path, title, level, content)
            VALUES (?, ?, ?, ?)
            """,
            (rel_path, section["title"], section["level"], section["content"]),
        )
        conn.execute(
            "INSERT INTO search_index (path, title, content, type) VALUES (?, ?, ?, 'section')",
            (rel_path, section["title"], section["content"][:1000]),
        )

    for symbol in symbols:
        conn.execute(
            """
            INSERT INTO code_symbols (file_path, name, kind, line_start, signature)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                rel_path,
                symbol["name"],
                symbol["kind"],
                symbol["line_start"],
                symbol["signature"],
            ),
        )
        conn.execute(
            "INSERT INTO search_index (path, title, content, type) VALUES (?, ?, ?, 'symbol')",
            (rel_path, f"{symbol['kind']}: {symbol['name']}", symbol["signature"]),
        )


def _python_index_dirty_paths(project_root: Path, dirty_paths: list[str]) -> int:
    ensure_db_schema(project_root)
    conn = get_db(project_root)
    indexed = 0
    for rel_path in dirty_paths:
        full_path = project_root / rel_path
        if not full_path.exists():
            continue
        try:
            content = full_path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        stat = full_path.stat()
        symbols, sections = _parse_symbols_and_sections(rel_path, content)
        _write_index_rows(
            conn,
            rel_path,
            size=stat.st_size,
            last_modified=stat.st_mtime,
            category=infer_category(rel_path),
            content=content,
            symbols=symbols,
            sections=sections,
        )
        indexed += 1
    conn.commit()
    conn.close()
    return indexed


def _count_fresh_indexed_paths(project_root: Path, paths: list[str]) -> int:
    normalized = [path for path in paths if (project_root / path).exists()]
    if not normalized:
        return 0

    conn = get_db(project_root)
    rows = {}
    for offset in range(0, len(normalized), 200):
        chunk = normalized[offset : offset + 200]
        placeholders = ", ".join("?" for _ in chunk)
        result = conn.execute(
            f"SELECT path, size, last_modified FROM files WHERE path IN ({placeholders})",
            tuple(chunk),
        ).fetchall()
        rows.update({row["path"]: row for row in result})
    conn.close()

    fresh = 0
    for rel_path in normalized:
        stat = (project_root / rel_path).stat()
        row = rows.get(rel_path)
        if row and row["size"] == stat.st_size and abs(row["last_modified"] - stat.st_mtime) < 1.0:
            fresh += 1
    return fresh


def _is_supported_scan_target(rel_path: str) -> bool:
    normalized = _normalize_path(rel_path)
    suffix = Path(normalized).suffix.lower()
    basename = Path(normalized).name.lower()
    return (
        suffix in CODE_EXTENSIONS
        or suffix in DOC_EXTENSIONS
        or basename in DOC_BASENAMES
    )


def _scan_workspace_files(
    project_root: Path, workspace, scope: str
) -> list[tuple[str, float, int]]:
    rows: list[tuple[str, float, int]] = []
    for full_path in sorted(project_root.rglob("*")):
        if not full_path.is_file():
            continue
        rel_path = full_path.relative_to(project_root).as_posix()
        if not _is_supported_scan_target(rel_path):
            continue
        if not should_index_path(rel_path, scope, workspace):
            continue
        stat = full_path.stat()
        rows.append((rel_path, stat.st_mtime, stat.st_size))
    return rows


def _scan_workspace_dirs(project_root: Path, workspace, scope: str) -> list[str]:
    directories = {"."}
    for rel_path, _, _ in _scan_workspace_files(project_root, workspace, scope):
        parent = Path(rel_path).parent
        while True:
            parent_posix = parent.as_posix()
            if parent_posix in {"", "."}:
                directories.add(".")
                break
            directories.add(parent_posix)
            parent = parent.parent
    return sorted(directories, key=lambda value: value.count("/"), reverse=True)


def init_db(project_root: Path):
    conn = get_db(project_root)
    cursor = conn.cursor()
    cursor.execute(
        """CREATE TABLE IF NOT EXISTS files (
        path TEXT PRIMARY KEY,
        size INTEGER,
        last_modified REAL,
        category TEXT,
        indexed_at TEXT
    )"""
    )
    cursor.execute(
        """CREATE TABLE IF NOT EXISTS doc_sections (
        file_path TEXT,
        title TEXT,
        level INTEGER,
        content TEXT
    )"""
    )
    cursor.execute(
        """CREATE TABLE IF NOT EXISTS code_symbols (
        file_path TEXT,
        name TEXT,
        kind TEXT,
        line_start INTEGER,
        signature TEXT
    )"""
    )
    cursor.execute(
        """CREATE TABLE IF NOT EXISTS work_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
        action TEXT,
        details TEXT,
        status TEXT
    )"""
    )
    cursor.execute(
        """CREATE TABLE IF NOT EXISTS raw_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        source TEXT,
        content TEXT
    )"""
    )
    cursor.execute(
        """CREATE TABLE IF NOT EXISTS sync_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        started_at TEXT,
        finished_at TEXT,
        mode TEXT,
        scope TEXT,
        workspace_name TEXT,
        resolution_reason TEXT,
        scanned_rows INTEGER DEFAULT 0,
        changed_rows INTEGER DEFAULT 0,
        reused_rows INTEGER DEFAULT 0,
        deleted_rows INTEGER DEFAULT 0,
        missing_on_disk INTEGER DEFAULT 0,
        out_of_workspace INTEGER DEFAULT 0,
        duration_ms INTEGER DEFAULT 0,
        status TEXT,
        notes TEXT
    )"""
    )
    cursor.execute(
        """CREATE TABLE IF NOT EXISTS session_runs (
        session_id TEXT PRIMARY KEY,
        session_type TEXT,
        command_json TEXT,
        cwd TEXT,
        status TEXT,
        started_at REAL,
        last_activity REAL,
        ended_at REAL,
        pid INTEGER,
        exit_code INTEGER,
        stop_reason TEXT
    )"""
    )
    cursor.execute(
        """CREATE VIRTUAL TABLE IF NOT EXISTS search_index
        USING fts5(path, title, content, type, tokenize='unicode61')"""
    )
    cursor.execute(
        """CREATE TABLE IF NOT EXISTS wiki_pages (
        id TEXT PRIMARY KEY,
        scope TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT,
        key_points TEXT,
        evidence TEXT,
        related TEXT,
        open_questions TEXT,
        source_raw TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )"""
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS wiki_scope_idx ON wiki_pages(scope)"
    )
    conn.commit()
    conn.close()


def ensure_db_schema(project_root: Path):
    init_db(project_root)


def retag_indexed_files(project_root: Path, paths: list[str] | None = None) -> int:
    ensure_db_schema(project_root)
    conn = get_db(project_root)
    cursor = conn.cursor()
    if paths:
        normalized = sorted({_normalize_path(path) for path in paths})
        if not normalized:
            conn.close()
            return 0
        rows = [(infer_category(path), path) for path in normalized]
        cursor.executemany("UPDATE files SET category = ? WHERE path = ?", rows)
        changed = len(rows)
    else:
        existing = cursor.execute("SELECT path FROM files").fetchall()
        rows = [(infer_category(row["path"]), row["path"]) for row in existing]
        cursor.executemany("UPDATE files SET category = ? WHERE path = ?", rows)
        changed = len(rows)
    conn.commit()
    conn.close()
    return changed


def apply_global_tags(project_root: Path):
    return retag_indexed_files(project_root)


def _record_run(
    project_root: Path,
    *,
    mode: str,
    scope: str,
    workspace,
    started_at: float,
    status: str,
    metrics: dict | None = None,
    notes: str = "",
) -> None:
    ensure_db_schema(project_root)
    metrics = metrics or {}
    finished_at = time.time()
    duration_ms = int((finished_at - started_at) * 1000)
    conn = get_db(project_root)
    conn.execute(
        """
        INSERT INTO sync_runs (
            started_at, finished_at, mode, scope, workspace_name, resolution_reason,
            scanned_rows, changed_rows, reused_rows, deleted_rows,
            missing_on_disk, out_of_workspace, duration_ms, status, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(started_at)),
            time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(finished_at)),
            mode,
            scope,
            workspace.name,
            workspace.resolution_reason,
            metrics.get("scanned_rows", 0),
            metrics.get("changed_rows", 0),
            metrics.get("reused_rows", 0),
            metrics.get("deleted_rows", 0),
            metrics.get("missing_on_disk", 0),
            metrics.get("out_of_workspace", 0),
            duration_ms,
            status,
            notes,
        ),
    )
    conn.commit()
    conn.close()


def get_recent_runs(project_root: Path, limit: int = 10) -> list[dict]:
    ensure_db_schema(project_root)
    conn = get_db(project_root)
    rows = conn.execute(
        """
        SELECT started_at, finished_at, mode, scope, workspace_name, resolution_reason,
               scanned_rows, changed_rows, reused_rows, deleted_rows,
               missing_on_disk, out_of_workspace, duration_ms, status, notes
        FROM sync_runs
        ORDER BY id DESC
        LIMIT ?
        """,
        (limit,),
    ).fetchall()
    conn.close()
    return [dict(row) for row in rows]


def cleanup_snapshots(project_root: Path, hours: int = 24) -> int:
    ensure_db_schema(project_root)
    conn = get_db(project_root)
    cursor = conn.cursor()
    cursor.execute(
        "DELETE FROM raw_snapshots WHERE timestamp < datetime('now', '-' || ? || ' hours')",
        (hours,),
    )
    deleted = cursor.rowcount
    conn.commit()
    conn.close()
    return deleted


def get_snapshot_context_exact(
    project_root: Path, sources: list[str], limit: int = 5
) -> list[dict]:
    ensure_db_schema(project_root)
    normalized = [source for source in sources if source]
    if not normalized:
        return []

    placeholders = ", ".join("?" for _ in normalized)
    conn = get_db(project_root)
    rows = conn.execute(
        f"""
        SELECT timestamp, source, content
        FROM raw_snapshots
        WHERE source IN ({placeholders})
        ORDER BY timestamp DESC
        LIMIT ?
        """,
        (*normalized, limit),
    ).fetchall()
    conn.close()
    return [dict(row) for row in rows]


def sync_bottom_up(
    project_root: Path, scope: str = "all", max_workers: int = 8, workspace=None
) -> str:
    workspace = workspace or resolve_workspace(root_override=project_root)
    start_time = time.time()
    ensure_db_schema(project_root)
    dirs = _scan_workspace_dirs(project_root, workspace, scope)

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        results = list(
            executor.map(
                lambda d: process_folder_no_tag(project_root, d, workspace, scope), dirs
            )
        )
    total_files = sum(result["requested"] for result in results)
    failed_dirs = [result["dir"] for result in results if not result["ok"]]
    retag_indexed_files(project_root)

    metrics = {
        "scanned_rows": total_files,
        "changed_rows": total_files,
    }
    notes = f"dirs={len(dirs)} workers={max_workers}"
    if failed_dirs:
        notes += f" failed_dirs={','.join(failed_dirs[:5])}"
    _record_run(
        project_root,
        mode="sync-map",
        scope=scope,
        workspace=workspace,
        started_at=start_time,
        status="error" if failed_dirs else "success",
        metrics=metrics,
        notes=notes,
    )
    duration = time.time() - start_time
    status_word = "error" if failed_dirs else "success"
    failure_suffix = f", failed_dirs={len(failed_dirs)}" if failed_dirs else ""
    return (
        f"sync-map {status_word}: indexed={total_files}, dirs={len(dirs)}, "
        f"workers={max_workers}, duration={duration:.2f}s{failure_suffix}"
    )


def process_folder_no_tag(project_root, rel_dir, workspace, scope):
    full_dir = project_root / rel_dir
    target_files = []
    try:
        for entry in os.scandir(full_dir):
            if entry.is_file():
                rel_file_path = str(Path(rel_dir) / entry.name).replace("\\", "/")
                if rel_file_path.startswith("./"):
                    rel_file_path = rel_file_path[2:]
                if should_index_path(rel_file_path, scope, workspace):
                    target_files.append(rel_file_path)
    except Exception:
        return {"dir": rel_dir, "requested": 0, "ok": False}

    if target_files:
        result = ingest_core(
            project_root,
            target_files,
            start_time=None,
            auto_tag=False,
            workspace=workspace,
            scope=scope,
            mode="ingest-batch",
        )
        return {
            "dir": rel_dir,
            "requested": len(target_files),
            "ok": not result_has_error(result),
        }
    return {"dir": rel_dir, "requested": 0, "ok": True}


def sync_core(project_root: Path, scope: str = "all", workspace=None) -> str:
    workspace = workspace or resolve_workspace(root_override=project_root)
    ensure_db_schema(project_root)
    start_time = time.time()

    conn = get_db(project_root)
    cursor = conn.cursor()
    cursor.execute("SELECT path, last_modified, size FROM files")
    db_files = {row["path"]: (row["last_modified"], row["size"]) for row in cursor.fetchall()}

    changed_list = []
    seen_paths = set()
    reused_count = 0
    scanned_rows = 0

    for rel_path, mtime, size in _scan_workspace_files(project_root, workspace, scope):
        scanned_rows += 1
        seen_paths.add(rel_path)
        if rel_path in db_files:
            db_mtime, db_size = db_files[rel_path]
            if abs(mtime - db_mtime) < 1.0 and size == db_size:
                reused_count += 1
                continue
        changed_list.append(rel_path)

    cleanup_candidates = (
        set(db_files.keys())
        if scope == "all"
        else {path for path in db_files.keys() if matches_scope(path, scope)}
    )
    deleted_paths = {
        path
        for path in cleanup_candidates
        if not workspace.includes_path(path) or path not in seen_paths
    }
    if deleted_paths:
        for rel_path in deleted_paths:
            cursor.execute("DELETE FROM files WHERE path = ?", (rel_path,))
            cursor.execute("DELETE FROM doc_sections WHERE file_path = ?", (rel_path,))
            cursor.execute("DELETE FROM code_symbols WHERE file_path = ?", (rel_path,))
            cursor.execute("DELETE FROM search_index WHERE path = ?", (rel_path,))
        conn.commit()
    conn.close()

    if not changed_list:
        if scope == "all":
            retag_indexed_files(project_root)
        metrics = {
            "scanned_rows": scanned_rows,
            "reused_rows": reused_count,
            "deleted_rows": len(deleted_paths),
        }
        _record_run(
            project_root,
            mode="sync",
            scope=scope,
            workspace=workspace,
            started_at=start_time,
            status="success",
            metrics=metrics,
        )
        return (
            f"sync success: scanned={scanned_rows}, changed=0, reused={reused_count}, "
            f"deleted={len(deleted_paths)}, duration={time.time() - start_time:.2f}s"
        )

    result = ingest_core(
        project_root,
        changed_list,
        start_time=start_time,
        reused_count=reused_count,
        workspace=workspace,
        scope=scope,
        mode="sync",
        scanned_rows=scanned_rows,
        deleted_rows=len(deleted_paths),
    )
    if scope == "all":
        retag_indexed_files(project_root)
    return result


def ingest_core(
    project_root: Path,
    dirty_paths: list[str],
    start_time: float = None,
    reused_count: int = 0,
    auto_tag: bool = True,
    workspace=None,
    scope: str = "all",
    mode: str = "ingest",
    scanned_rows: int | None = None,
    deleted_rows: int = 0,
) -> str:
    workspace = workspace or resolve_workspace(root_override=project_root)
    dirty_paths = [
        _normalize_path(path)
        for path in dirty_paths
        if should_index_path(path, scope, workspace)
    ]
    if not dirty_paths:
        return "No files to ingest."

    if start_time is None:
        start_time = time.time()

    ensure_db_schema(project_root)
    db_path = str(project_root / ".musu_dev.db")
    tmp_dir = project_root / "work" / "tmp"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    list_file = tmp_dir / "sync_targets.txt"
    list_file.write_text("\n".join(dirty_paths), encoding="utf-8")

    cmd = resolve_and_materialize(
        LINUX_BIN, "index", db_path, str(project_root), str(list_file)
    )
    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="ignore",
    )
    for _line in process.stdout:
        pass
    process.wait()

    expected_rows = sum(1 for path in dirty_paths if (project_root / path).exists())
    fresh_rows = _count_fresh_indexed_paths(project_root, dirty_paths)
    fallback_used = False
    fallback_indexed = 0
    if expected_rows and fresh_rows < expected_rows:
        fallback_indexed = _python_index_dirty_paths(project_root, dirty_paths)
        fresh_rows = _count_fresh_indexed_paths(project_root, dirty_paths)
        fallback_used = True

    if auto_tag:
        retag_indexed_files(project_root, dirty_paths)
        conn = get_db(project_root)
        conn.execute(
            "INSERT INTO work_log (action, details, status) VALUES ('sync_or_ingest', ?, 'success')",
            (f"Processed {len(dirty_paths)} files, {reused_count} reused",),
        )
        conn.commit()
        conn.close()

    metrics = {
        "scanned_rows": scanned_rows if scanned_rows is not None else len(dirty_paths),
        "changed_rows": len(dirty_paths),
        "reused_rows": reused_count,
        "deleted_rows": deleted_rows,
    }
    final_success = fresh_rows == expected_rows and expected_rows > 0
    if not dirty_paths:
        final_success = True
    notes = (
        f"index_exit={process.returncode} fresh_rows={fresh_rows}/{expected_rows}"
    )
    if fallback_used:
        notes += f" fallback=python indexed={fallback_indexed}"
    _record_run(
        project_root,
        mode=mode,
        scope=scope,
        workspace=workspace,
        started_at=start_time,
        status="success" if final_success else "error",
        metrics=metrics,
        notes=notes,
    )
    status_word = "success" if final_success else "error"
    fallback_suffix = f", fallback=python({fallback_indexed})" if fallback_used else ""
    return (
        f"{mode} {status_word}: scanned={metrics['scanned_rows']}, changed={len(dirty_paths)}, "
        f"reused={reused_count}, deleted={deleted_rows}, duration={time.time() - start_time:.2f}s"
        f"{fallback_suffix}"
    )


def get_recent(project_root: Path, limit: int = 10, workspace=None) -> list[dict]:
    workspace = workspace or resolve_workspace(root_override=project_root)
    ensure_db_schema(project_root)
    conn = get_db(project_root)
    rows = conn.execute(
        """
        SELECT path, category,
               datetime(last_modified, 'unixepoch', 'localtime') as mod_time
        FROM files
        ORDER BY last_modified DESC
        LIMIT ?
        """,
        (limit * 5,),
    ).fetchall()
    conn.close()

    results = []
    for row in rows:
        if not workspace.includes_path(row["path"]):
            continue
        results.append(
            {
                "path": row["path"],
                "category": row["category"],
                "modified": row["mod_time"],
            }
        )
        if len(results) >= limit:
            break
    return results


def _matches_exclude_pattern(rel_path: str, pattern: str) -> bool:
    normalized_path = _normalize_path(rel_path)
    normalized_pattern = _normalize_path(pattern).strip()
    if not normalized_pattern:
        return False
    if any(token in normalized_pattern for token in "*?[]"):
        return fnmatch(normalized_path, normalized_pattern) or Path(
            normalized_path
        ).match(normalized_pattern)
    if "/" in normalized_pattern:
        return normalized_path == normalized_pattern or normalized_path.startswith(
            f"{normalized_pattern}/"
        )
    extension_pattern = (
        normalized_pattern
        if normalized_pattern.startswith(".")
        else f".{normalized_pattern}"
    )
    return normalized_path.endswith(extension_pattern)


def _score_search_result(row, normalized_query: str, ranked_terms, scope: str) -> int:
    path_value = row["path"].lower()
    title_value = row["title"].lower()
    snippet_value = (row["match_snippet"] or "").lower()
    category_value = (row["category"] or "").lower()
    type_value = row["type"].lower()

    score = 0
    if normalized_query and normalized_query in path_value:
        score += 40
    if normalized_query and normalized_query in title_value:
        score += 60
    if normalized_query and normalized_query in snippet_value:
        score += 20

    for term, weight in ranked_terms:
        if term in title_value:
            score += weight * 12
        if term in path_value:
            score += weight * 8
        if term in snippet_value:
            score += weight * 4
        if term == category_value:
            score += weight * 10
        if term == type_value:
            score += weight * 6

    if scope == "doc" and category_value in {"guide", "plan", "report", "spec", "reference"}:
        score += 25
    if scope == "code" and category_value in {"code", "config"}:
        score += 25
    if type_value == "symbol":
        score += 8
    if type_value == "section":
        score += 5
    return score


def search_index(
    project_root: Path,
    query: str,
    limit: int = 15,
    exclude_patterns: list[str] = None,
    workspace=None,
    scope: str = "all",
) -> list[dict]:
    workspace = workspace or resolve_workspace(root_override=project_root)
    ensure_db_schema(project_root)
    conn = get_db(project_root)
    fts_query = QueryExpander.build_fts_query(query, max_terms=8)
    if not fts_query:
        conn.close()
        return []

    rows = conn.execute(
        """
        SELECT si.path, si.title, si.type, f.category,
               snippet(search_index, -1, '<b>', '</b>', '...', 32) as match_snippet
        FROM search_index si
        LEFT JOIN files f ON f.path = si.path
        WHERE si.content MATCH ?
        LIMIT ?
        """,
        (fts_query, limit * 8),
    ).fetchall()
    conn.close()

    normalized_excludes = [pattern for pattern in (exclude_patterns or []) if pattern]
    normalized_query = QueryExpander.normalize_text(query)
    ranked_terms = QueryExpander.expand_query(query, max_terms=8)

    results = []
    for row in rows:
        rel_path = row["path"]
        if not workspace.includes_path(rel_path):
            continue
        if scope != "all" and not matches_scope(rel_path, scope):
            continue
        if normalized_excludes and any(
            _matches_exclude_pattern(rel_path, pattern)
            for pattern in normalized_excludes
        ):
            continue
        result = {
            "path": row["path"],
            "title": row["title"],
            "type": row["type"],
            "category": row["category"] or infer_category(row["path"]),
            "snippet": row["match_snippet"],
        }
        result["score"] = _score_search_result(row, normalized_query, ranked_terms, scope)
        results.append(result)

    results.sort(key=lambda item: (-item["score"], item["path"], item["title"]))
    return results[:limit]


def reconcile_index(
    project_root: Path,
    scope: str = "all",
    workspace=None,
    dry_run: bool = False,
) -> str:
    workspace = workspace or resolve_workspace(root_override=project_root)
    ensure_db_schema(project_root)
    start_time = time.time()
    conn = get_db(project_root)
    rows = conn.execute("SELECT path FROM files").fetchall()

    scanned_rows = 0
    missing_on_disk = []
    out_of_workspace = []

    for row in rows:
        rel_path = row["path"]
        if scope != "all" and not matches_scope(rel_path, scope):
            continue
        scanned_rows += 1

        if not workspace.includes_path(rel_path):
            out_of_workspace.append(rel_path)
            continue
        if not (project_root / rel_path).exists():
            missing_on_disk.append(rel_path)

    prune_paths = sorted(set(out_of_workspace + missing_on_disk))
    deleted_rows = 0
    if not dry_run and prune_paths:
        for rel_path in prune_paths:
            conn.execute("DELETE FROM files WHERE path = ?", (rel_path,))
            conn.execute("DELETE FROM doc_sections WHERE file_path = ?", (rel_path,))
            conn.execute("DELETE FROM code_symbols WHERE file_path = ?", (rel_path,))
            conn.execute("DELETE FROM search_index WHERE path = ?", (rel_path,))
        conn.commit()
        deleted_rows = len(prune_paths)
    conn.close()

    metrics = {
        "scanned_rows": scanned_rows,
        "deleted_rows": deleted_rows,
        "missing_on_disk": len(missing_on_disk),
        "out_of_workspace": len(out_of_workspace),
    }
    _record_run(
        project_root,
        mode="cleanup",
        scope=scope,
        workspace=workspace,
        started_at=start_time,
        status="success",
        metrics=metrics,
        notes="dry-run" if dry_run else "applied",
    )
    action = "dry-run" if dry_run else "applied"
    return (
        f"cleanup {action}: scanned={scanned_rows}, missing_on_disk={len(missing_on_disk)}, "
        f"out_of_workspace={len(out_of_workspace)}, deleted_rows={deleted_rows}"
    )


def get_spy_context(project_root: Path, source_keyword: str, limit: int = 5) -> list[dict]:
    ensure_db_schema(project_root)
    conn = get_db(project_root)
    rows = conn.execute(
        """
        SELECT timestamp, source, content
        FROM raw_snapshots
        WHERE source LIKE ?
        ORDER BY timestamp DESC
        LIMIT ?
        """,
        (f"%{source_keyword}%", limit),
    ).fetchall()
    conn.close()
    return [dict(row) for row in rows]


def log_activity(project_root: Path, message: str) -> None:
    ensure_db_schema(project_root)
    conn = get_db(project_root)
    conn.execute(
        "INSERT INTO work_log (action, details, status) VALUES ('agent_log', ?, 'done')",
        (message,),
    )
    conn.commit()
    conn.close()
