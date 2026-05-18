"""V23.5 W-6 — ingest Tier-1 docs into ``~/llm-wiki/global/`` for agent-facing W-4 render.

Tier-1 docs are the 12 highest-value musu documents an agent should be able to
read on-demand via the W-3 server-side HTML endpoint (``GET /api/wiki/page/<id>/html``)
and surface through the W-4 agent page route.

Per V23.5 Master Plan §2.1 (wiki/459) + Auditor A6:
  - Target dir: ``~/llm-wiki/global/`` (no ``company_id`` query at read time)
  - Page-id namespace prefix: ``v23_5_html_demo_*`` — isolates demo content
    from existing operational wiki entries, so accidental overwrite is impossible.

HTML source docs are intentionally skipped (warning logged); markdown-only ingest
avoids adding a markdownify dependency to V23.5 scope. Two of the original Top-12
candidates are HTML closures (Phase 4 final closure + architecture overview); the
ten remaining markdown docs cover plan, evaluation, research, brainstorm, charter,
and index content sufficient for the W-4 agent demo.

Usage::

    python scripts/v23_5_ingest_tier1_docs.py            # real ingest
    python scripts/v23_5_ingest_tier1_docs.py --dry-run  # preview, no writes

Honours ``MUSU_WIKI_BASE`` env var (same convention as
``musu-bridge/wiki_routes.py:_WIKI_BASE``). Idempotent — re-running overwrites.

Exit codes:
  - 0: at least one doc copied (or dry-run preview emitted)
  - 1: nothing copied (all sources missing or HTML-skipped + no md sources)
  - 2: precondition failure (target dir cannot be created / not writable)
"""
from __future__ import annotations

import os
import shutil
import sys
from pathlib import Path

_WIKI_BASE = Path(os.environ.get("MUSU_WIKI_BASE", str(Path.home() / "llm-wiki")))
_TIER1_SCOPE = "global"  # per master plan §2.1
_PAGE_ID_PREFIX = "v23_5_html_demo_"  # Auditor A6 namespace isolation

# Source paths are repo-relative (resolved against repo root at runtime).
# Each entry: (src_rel_path, target_stem_without_prefix).
# Target filename = f"{_PAGE_ID_PREFIX}{target_stem}.md"
_TIER1_DOCS: list[tuple[str, str]] = [
    ("docs/V23_5_MASTER_PLAN_2026_05_19.md", "v23_5_master_plan"),
    ("docs/V23_5_IMPL_PLAN_2026_05_19.md", "v23_5_impl_plan"),
    ("docs/V23_4_PHASE4_QUAL_EVAL_2026_05_19.md", "v23_4_phase4_qual_eval"),
    ("docs/PRODUCT_CHARTER/SSOT_1PAGE_2026-04-09.md", "ssot_1page"),
    ("docs/WIKI_INDEX.md", "wiki_index"),
    ("docs/RESEARCH_HTML_OVER_MARKDOWN_2026_05_18.md", "research_html_over_markdown"),
    ("docs/RESEARCH_3LAYER_AND_HTML_WIKI_MEMORY_2026_05_18.md", "research_3layer_html_wiki"),
    ("docs/BRAINSTORM_PAPERCLIP_OBSERVER_2026_05_18.md", "brainstorm_paperclip"),
    ("docs/V23_3_FINAL_CLOSURE_2026_05_17.md", "v23_3_final_closure"),
    ("docs/V23_4_PHASE4_MASTER_PLAN_2026_05_18.md", "v23_4_phase4_master_plan"),
    # HTML closures intentionally skipped (no markdownify dep) — listed for traceability:
    ("docs/V23_4_PHASE4_FINAL_CLOSURE_2026_05_19.html", "v23_4_phase4_final_closure"),
    ("docs/MUSU_ARCHITECTURE_2026_05_18.html", "musu_architecture"),
]


def _is_markdown(src_rel: str) -> bool:
    return src_rel.lower().endswith(".md")


def main(dry_run: bool = False) -> int:
    target_dir = _WIKI_BASE / _TIER1_SCOPE
    # ── Precondition: target dir must be creatable + writable ──────────────────
    if not dry_run:
        try:
            target_dir.mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            print(f"ERROR: cannot create {target_dir}: {exc}", file=sys.stderr)
            return 2
        if not os.access(str(target_dir), os.W_OK):
            print(f"ERROR: {target_dir} not writable", file=sys.stderr)
            return 2
    else:
        # dry-run: still verify target dir exists OR is creatable, but don't create
        if not target_dir.exists() and not os.access(str(target_dir.parent), os.W_OK):
            print(f"WARN (dry-run): {target_dir.parent} not writable; real run would fail", file=sys.stderr)

    repo_root = Path(__file__).resolve().parent.parent
    copied = 0
    skipped_missing = 0
    skipped_html = 0
    failed = 0

    for src_rel, target_stem in _TIER1_DOCS:
        src = repo_root / src_rel
        target_name = f"{_PAGE_ID_PREFIX}{target_stem}.md"
        dest = target_dir / target_name

        if not _is_markdown(src_rel):
            print(f"  SKIP html (no markdownify dep): {src_rel}", file=sys.stderr)
            skipped_html += 1
            continue
        if not src.exists():
            print(f"  SKIP missing: {src_rel}", file=sys.stderr)
            skipped_missing += 1
            continue
        if dry_run:
            print(f"  WOULD copy: {src_rel} -> {_TIER1_SCOPE}/{target_name}")
            copied += 1
            continue
        try:
            shutil.copy2(src, dest)
            print(f"  OK: {src_rel} -> {_TIER1_SCOPE}/{target_name}")
            copied += 1
        except OSError as exc:
            print(f"  FAIL {src_rel}: {exc}", file=sys.stderr)
            failed += 1

    print(
        f"\nDone: {copied} copied, "
        f"{skipped_missing} missing, "
        f"{skipped_html} html-skipped, "
        f"{failed} failed "
        f"(target: {target_dir})"
    )
    if copied == 0:
        return 1
    return 0


if __name__ == "__main__":
    dry = "--dry-run" in sys.argv
    sys.exit(main(dry_run=dry))
