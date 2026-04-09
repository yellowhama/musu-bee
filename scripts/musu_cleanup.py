#!/usr/bin/env python3
"""
MUSU disk hygiene cleanup (safe-by-default).

Default mode is dry-run. Use --apply to actually delete files.

Targets (defaults):
  ~/.musu/logs
  ~/.musu/run
  ~/.musu/artifacts

Policies (defaults; override with env vars):
  - TTL days: logs=7, run=3, artifacts=14
  - Size caps: logs=1024MB, run=100MB, artifacts=2048MB
  - Min age: 10 minutes (don't delete very-recent files)
"""

from __future__ import annotations

import argparse
import json
import os
import time
from dataclasses import dataclass
from pathlib import Path


def _int_env(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return value


def _mb_to_bytes(mb: int) -> int:
    return max(0, mb) * 1024 * 1024


@dataclass(frozen=True)
class Policy:
    ttl_days: int
    size_cap_bytes: int


@dataclass
class FileEntry:
    path: Path
    size_bytes: int
    mtime: float


def _list_files(root: Path) -> list[FileEntry]:
    out: list[FileEntry] = []
    if not root.exists() or not root.is_dir():
        return out
    for p in root.rglob("*"):
        try:
            if not p.is_file():
                continue
            st = p.stat()
        except OSError:
            continue
        out.append(FileEntry(path=p, size_bytes=st.st_size, mtime=st.st_mtime))
    return out


def _remove_file(path: Path) -> bool:
    try:
        path.unlink(missing_ok=True)
        return True
    except OSError:
        return False


def _cleanup_root(
    root: Path,
    policy: Policy,
    now: float,
    min_age_seconds: float,
    apply: bool,
) -> dict:
    files = _list_files(root)
    total_bytes = sum(f.size_bytes for f in files)

    ttl_seconds = max(0, policy.ttl_days) * 24 * 60 * 60
    cutoff = now - ttl_seconds
    min_age_cutoff = now - min_age_seconds

    candidates_old = [
        f for f in files if f.mtime < cutoff and f.mtime < min_age_cutoff
    ]
    candidates_old.sort(key=lambda f: f.mtime)  # oldest first

    planned: list[FileEntry] = []
    deleted: list[dict] = []

    # 1) TTL deletions
    for f in candidates_old:
        planned.append(f)

    # 2) Size-cap deletions (oldest-first) after TTL
    # Recompute predicted size after planned TTL deletions.
    predicted_bytes = total_bytes - sum(f.size_bytes for f in planned)
    if policy.size_cap_bytes > 0 and predicted_bytes > policy.size_cap_bytes:
        remaining = [f for f in files if f not in planned and f.mtime < min_age_cutoff]
        remaining.sort(key=lambda f: f.mtime)
        for f in remaining:
            planned.append(f)
            predicted_bytes -= f.size_bytes
            if predicted_bytes <= policy.size_cap_bytes:
                break

    # Apply deletions
    bytes_freed = 0
    if apply:
        for f in planned:
            ok = _remove_file(f.path)
            if ok:
                bytes_freed += f.size_bytes
            deleted.append(
                {
                    "path": str(f.path),
                    "size_bytes": f.size_bytes,
                    "mtime": f.mtime,
                    "deleted": ok,
                }
            )

    return {
        "root": str(root),
        "exists": root.exists(),
        "policy": {
            "ttl_days": policy.ttl_days,
            "size_cap_bytes": policy.size_cap_bytes,
        },
        "min_age_seconds": min_age_seconds,
        "total_files": len(files),
        "total_bytes": total_bytes,
        "planned_delete_files": len(planned),
        "planned_delete_bytes": sum(f.size_bytes for f in planned),
        "bytes_freed": bytes_freed,
        "deleted": deleted if apply else [],
        "dry_run": not apply,
        "notes": [
            "Deletion plan excludes files modified within min_age_seconds.",
            "Size-cap enforcement is oldest-first after TTL deletions.",
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="MUSU disk hygiene cleanup (dry-run by default)")
    parser.add_argument("--apply", action="store_true", help="Actually delete files (otherwise dry-run)")
    parser.add_argument("--json", action="store_true", help="Print JSON report")
    parser.add_argument(
        "--root",
        action="append",
        default=[],
        help="Extra root directory to include (can be passed multiple times)",
    )
    args = parser.parse_args()

    home = Path.home()
    default_roots = [
        home / ".musu" / "logs",
        home / ".musu" / "run",
        home / ".musu" / "artifacts",
    ]
    extra_roots = [Path(p).expanduser() for p in args.root]
    roots = default_roots + extra_roots

    policies: dict[str, Policy] = {
        str(default_roots[0]): Policy(
            ttl_days=_int_env("MUSU_CLEANUP_LOGS_TTL_DAYS", 7),
            size_cap_bytes=_mb_to_bytes(_int_env("MUSU_CLEANUP_LOGS_SIZE_CAP_MB", 1024)),
        ),
        str(default_roots[1]): Policy(
            ttl_days=_int_env("MUSU_CLEANUP_RUN_TTL_DAYS", 3),
            size_cap_bytes=_mb_to_bytes(_int_env("MUSU_CLEANUP_RUN_SIZE_CAP_MB", 100)),
        ),
        str(default_roots[2]): Policy(
            ttl_days=_int_env("MUSU_CLEANUP_ARTIFACTS_TTL_DAYS", 14),
            size_cap_bytes=_mb_to_bytes(_int_env("MUSU_CLEANUP_ARTIFACTS_SIZE_CAP_MB", 2048)),
        ),
    }

    min_age_minutes = _int_env("MUSU_CLEANUP_MIN_AGE_MINUTES", 10)
    min_age_seconds = max(0, min_age_minutes) * 60
    now = time.time()

    report = {
        "tool": "musu_cleanup",
        "version": 1,
        "timestamp": now,
        "apply": bool(args.apply),
        "roots": [],
    }

    for root in roots:
        policy = policies.get(str(root)) or Policy(
            ttl_days=_int_env("MUSU_CLEANUP_DEFAULT_TTL_DAYS", 7),
            size_cap_bytes=_mb_to_bytes(_int_env("MUSU_CLEANUP_DEFAULT_SIZE_CAP_MB", 1024)),
        )
        report["roots"].append(
            _cleanup_root(
                root=root,
                policy=policy,
                now=now,
                min_age_seconds=min_age_seconds,
                apply=bool(args.apply),
            )
        )

    planned_bytes = sum(r["planned_delete_bytes"] for r in report["roots"])
    report["planned_delete_bytes_total"] = planned_bytes

    if args.json:
        print(json.dumps(report, indent=2, ensure_ascii=False))
    else:
        # human summary
        print(f"musu-cleanup: dry_run={str(not args.apply).lower()} planned_delete={planned_bytes} bytes")
        for r in report["roots"]:
            print(
                f"- {r['root']}: files={r['total_files']} size={r['total_bytes']} "
                f"planned_delete={r['planned_delete_files']} ({r['planned_delete_bytes']} bytes)"
            )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

