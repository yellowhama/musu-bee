#!/usr/bin/env python3
"""
wiki_ingest.py — LLM Wiki ingest tool

두 가지 모드:
  push   : ~/llm-wiki/wiki/ 파일들을 노드 API로 업로드 (다른 노드 동기화)
  import : raw/ 파일을 wiki/에 추가 (단순 복사 + 기본 포맷)

사용법:
  python wiki_ingest.py push --node http://127.0.0.1:8070 [--token TOKEN] [--folder FOLDER]
  python wiki_ingest.py import --src ~/llm-wiki/raw/myfile.md [--folder musu]
  python wiki_ingest.py status
"""

import argparse
import os
import re
import sys
import time
from pathlib import Path

WIKI_PATH = Path.home() / "llm-wiki" / "wiki"
RAW_PATH = Path.home() / "llm-wiki" / "raw"


# ── helpers ───────────────────────────────────────────────────────────────────

def slug(name: str) -> str:
    """Convert filename stem to a safe wiki page slug."""
    s = name.lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def wiki_title(content: str, fallback: str) -> str:
    for line in content.split("\n"):
        if line.startswith("# "):
            return line[2:].strip()
    return fallback


def iter_wiki_files(wiki_dir: Path):
    """Yield (path, page_id, folder) for all .md files."""
    for f in sorted(wiki_dir.glob("*.md")):
        yield f, f.stem, ""
    for subdir in sorted(wiki_dir.iterdir()):
        if subdir.is_dir():
            for f in sorted(subdir.glob("*.md")):
                yield f, f"{subdir.name}/{f.stem}", subdir.name


# ── push ──────────────────────────────────────────────────────────────────────

def cmd_push(args):
    try:
        import httpx
    except ImportError:
        print("ERROR: httpx not installed. Run: pip install httpx", file=sys.stderr)
        sys.exit(1)

    node_url = args.node.rstrip("/")
    token = args.token or os.getenv("MUSU_BRIDGE_TOKEN", "")
    if not token:
        print("ERROR: --token or MUSU_BRIDGE_TOKEN required", file=sys.stderr)
        sys.exit(1)

    wiki_dir = Path(args.wiki_dir).expanduser() if args.wiki_dir else WIKI_PATH
    if not wiki_dir.exists():
        print(f"ERROR: wiki dir not found: {wiki_dir}", file=sys.stderr)
        sys.exit(1)

    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    files = list(iter_wiki_files(wiki_dir))
    print(f"[wiki-ingest] push: {len(files)} files → {node_url}")

    ok = failed = skipped = 0
    with httpx.Client(timeout=30.0) as client:
        for path, page_id, folder in files:
            if args.folder and folder != args.folder:
                skipped += 1
                continue
            try:
                content = path.read_text(encoding="utf-8")
                resp = client.post(
                    f"{node_url}/api/wiki/page/{page_id}",
                    json={"content": content, "folder": folder},
                    headers=headers,
                )
                if resp.status_code == 200:
                    title = wiki_title(content, page_id)
                    print(f"  ✓ {page_id}  ({title[:50]})")
                    ok += 1
                else:
                    print(f"  ✗ {page_id}  HTTP {resp.status_code}: {resp.text[:80]}")
                    failed += 1
            except Exception as e:
                print(f"  ✗ {page_id}  ERROR: {e}")
                failed += 1
            time.sleep(0.05)  # gentle rate limit

    print(f"\n[wiki-ingest] done: {ok} pushed, {failed} failed, {skipped} skipped")
    if failed:
        sys.exit(1)


# ── import ────────────────────────────────────────────────────────────────────

def cmd_import(args):
    src = Path(args.src).expanduser()
    if not src.exists():
        print(f"ERROR: source file not found: {src}", file=sys.stderr)
        sys.exit(1)

    folder = args.folder or ""
    stem = slug(src.stem)
    wiki_dir = WIKI_PATH / folder if folder else WIKI_PATH
    wiki_dir.mkdir(parents=True, exist_ok=True)
    dest = wiki_dir / f"{stem}.md"

    content = src.read_text(encoding="utf-8")

    # If the file doesn't start with an H1, prepend one
    if not content.lstrip().startswith("# "):
        title = src.stem.replace("_", " ").replace("-", " ").title()
        content = f"# {title}\n\n{content}"

    dest.write_text(content, encoding="utf-8")
    print(f"[wiki-ingest] imported: {src.name} → {dest.relative_to(WIKI_PATH.parent.parent)}")
    print(f"  page_id: {folder + '/' + stem if folder else stem}")
    print(f"  title:   {wiki_title(content, stem)}")


# ── status ────────────────────────────────────────────────────────────────────

def cmd_status(args):
    wiki_dir = Path(args.wiki_dir).expanduser() if hasattr(args, "wiki_dir") and args.wiki_dir else WIKI_PATH
    raw_dir = Path(args.raw_dir).expanduser() if hasattr(args, "raw_dir") and args.raw_dir else RAW_PATH

    wiki_files = list(iter_wiki_files(wiki_dir))
    raw_files = list(raw_dir.glob("*.md")) if raw_dir.exists() else []

    wiki_stems = {f.stem for f, _, _ in wiki_files}
    raw_slugs = {slug(f.stem): f for f in raw_files}

    not_ingested = [(s, f) for s, f in raw_slugs.items() if s not in wiki_stems]

    print(f"[wiki-ingest] status")
    print(f"  wiki/  : {len(wiki_files)} pages")
    print(f"  raw/   : {len(raw_files)} files")

    folders = sorted({folder for _, _, folder in wiki_files if folder})
    if folders:
        print(f"  folders: {', '.join(folders)}")

    if not_ingested:
        print(f"\n  raw/ files not yet in wiki/ ({len(not_ingested)}):")
        for s, f in not_ingested:
            print(f"    {f.name}  → would become: {s}")
        print(f"\n  To import all:")
        print(f"    python wiki_ingest.py import --src <file> [--folder <folder>]")
    else:
        print(f"  All raw/ files are ingested ✓")


# ── main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Wiki ingest tool for musu-bridge")
    sub = parser.add_subparsers(dest="cmd", required=True)

    # push
    p_push = sub.add_parser("push", help="Upload wiki pages to a node via API")
    p_push.add_argument("--node", required=True, help="Node bridge URL, e.g. http://127.0.0.1:8070")
    p_push.add_argument("--token", help="Bearer token (or set MUSU_BRIDGE_TOKEN env)")
    p_push.add_argument("--folder", help="Only push pages in this folder")
    p_push.add_argument("--wiki-dir", help="Source wiki directory (default: ~/llm-wiki/wiki)")

    # import
    p_import = sub.add_parser("import", help="Copy a raw file into wiki/")
    p_import.add_argument("--src", required=True, help="Source file path")
    p_import.add_argument("--folder", help="Target folder in wiki/ (e.g. musu, notes)")

    # status
    p_status = sub.add_parser("status", help="Show wiki/raw file counts and gaps")
    p_status.add_argument("--wiki-dir", help="Wiki directory (default: ~/llm-wiki/wiki)")
    p_status.add_argument("--raw-dir", help="Raw directory (default: ~/llm-wiki/raw)")

    args = parser.parse_args()

    if args.cmd == "push":
        cmd_push(args)
    elif args.cmd == "import":
        cmd_import(args)
    elif args.cmd == "status":
        cmd_status(args)


if __name__ == "__main__":
    main()
