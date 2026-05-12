#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MUSU_CORE_SRC = ROOT / "musu-core" / "src"
MUSU_BRIDGE_DIR = ROOT / "musu-bridge"
if str(MUSU_CORE_SRC) not in sys.path:
    sys.path.insert(0, str(MUSU_CORE_SRC))
if str(MUSU_BRIDGE_DIR) not in sys.path:
    sys.path.insert(0, str(MUSU_BRIDGE_DIR))

from musu_core.backends.local import LocalBackend
from writer_company import (
    build_writer_company_manifest,
    load_writer_company_manifest,
    normalize_writer_company_manifest,
    upsert_writer_company,
)


def main() -> int:
    parser = argparse.ArgumentParser(description="Provision or refresh a writer-studio company in the MUSU local DB.")
    parser.add_argument("--db", default=os.environ.get("MUSU_DB_PATH", str(Path.home() / ".musu" / "musu.db")))
    parser.add_argument("--workspace-root", default=os.environ.get("MUSU_WRITER_WORKSPACE", str(Path.home() / "writer")))
    parser.add_argument("--manifest", default="")
    parser.add_argument("--print-manifest", action="store_true")
    args = parser.parse_args()

    if args.manifest:
        raw = load_writer_company_manifest(args.manifest)
    else:
        raw = build_writer_company_manifest(workspace_root=args.workspace_root)
    manifest = normalize_writer_company_manifest(raw, workspace_root=args.workspace_root)

    if args.print_manifest:
        print(json.dumps(manifest, ensure_ascii=False, indent=2))
        return 0

    backend = LocalBackend(args.db)
    result = upsert_writer_company(backend, manifest)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
