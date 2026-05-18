"""test_wiki_filesystem_precondition.py — V23.5 W-6 filesystem precondition + ingest script.

Covers:
  - Target dir writability precondition (positive)
  - Ingest script dry-run (no filesystem writes, exit 0)
  - Ingest script end-to-end (markdown copied with v23_5_html_demo_* prefix)
  - HTML source files are skipped (no markdownify dep introduced)
  - Idempotent re-run (re-running overwrites without error)

W-3 503 ``wiki_path_read_only`` filesystem fallback is already covered by
``test_wiki_html_render.py::test_html_render_503_path_not_readable`` — not
duplicated here.
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest

_REPO_ROOT = Path(__file__).resolve().parent.parent.parent
_SCRIPT = _REPO_ROOT / "scripts" / "v23_5_ingest_tier1_docs.py"
_PREFIX = "v23_5_html_demo_"


def _run_script(wiki_base: Path, *extra_args: str) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env["MUSU_WIKI_BASE"] = str(wiki_base)
    return subprocess.run(
        [sys.executable, str(_SCRIPT), *extra_args],
        capture_output=True,
        text=True,
        cwd=str(_REPO_ROOT),
        env=env,
        check=False,
    )


# ────────────────────────────────────────────────────────────────────────────
# Precondition: target dir writability
# ────────────────────────────────────────────────────────────────────────────

def test_w6_target_dir_writable_after_creation(tmp_path):
    """W-6 precondition: ``global/`` under ``MUSU_WIKI_BASE`` must be writable."""
    target = tmp_path / "wiki" / "global"
    target.mkdir(parents=True)
    assert target.exists()
    assert os.access(str(target), os.W_OK), "fresh tmp_path subdir should be writable"


# ────────────────────────────────────────────────────────────────────────────
# Dry-run smoke
# ────────────────────────────────────────────────────────────────────────────

def test_dry_run_does_not_write(tmp_path):
    wiki_base = tmp_path / "wiki"
    result = _run_script(wiki_base, "--dry-run")
    assert result.returncode == 0, f"stderr={result.stderr!r} stdout={result.stdout!r}"
    assert "WOULD copy" in result.stdout
    assert "Done:" in result.stdout
    # Dry-run must NOT create the wiki directory or any files
    assert not (wiki_base / "global").exists() or not any((wiki_base / "global").iterdir())


# ────────────────────────────────────────────────────────────────────────────
# End-to-end: real ingest into tmp wiki
# ────────────────────────────────────────────────────────────────────────────

def test_ingest_writes_prefixed_markdown(tmp_path):
    wiki_base = tmp_path / "wiki"
    result = _run_script(wiki_base)
    assert result.returncode == 0, f"stderr={result.stderr!r} stdout={result.stdout!r}"

    global_dir = wiki_base / "global"
    assert global_dir.is_dir(), "ingest must create global/ scope dir"

    md_files = sorted(global_dir.glob("*.md"))
    # At least 8 markdown sources should be present in the repo at any point;
    # we expect close to 10 (the script lists 10 .md + 2 .html-skipped).
    assert len(md_files) >= 8, f"expected >=8 ingested .md files, got {len(md_files)}: {md_files}"

    # All ingested files must use the v23_5_html_demo_ namespace prefix
    for p in md_files:
        assert p.name.startswith(_PREFIX), f"missing namespace prefix: {p.name}"


def test_ingest_skips_html_sources(tmp_path):
    wiki_base = tmp_path / "wiki"
    result = _run_script(wiki_base)
    assert result.returncode == 0, result.stderr
    # HTML skip log must appear (the script lists 2 HTML sources)
    assert "SKIP html" in result.stderr
    # And no .html landed in global/
    global_dir = wiki_base / "global"
    html_files = list(global_dir.glob("*.html"))
    assert html_files == [], f"unexpected html files ingested: {html_files}"


def test_ingest_is_idempotent(tmp_path):
    wiki_base = tmp_path / "wiki"
    first = _run_script(wiki_base)
    assert first.returncode == 0, first.stderr
    files_first = sorted(p.name for p in (wiki_base / "global").glob("*.md"))

    second = _run_script(wiki_base)
    assert second.returncode == 0, second.stderr
    files_second = sorted(p.name for p in (wiki_base / "global").glob("*.md"))

    assert files_first == files_second, "idempotent re-run produced different file set"


# ────────────────────────────────────────────────────────────────────────────
# Exit code: precondition failure when target unwritable
# ────────────────────────────────────────────────────────────────────────────

@pytest.mark.skipif(sys.platform == "win32", reason="POSIX-only: chmod 0o000 dir doesn't block writes on Windows")
def test_ingest_exit_2_when_target_unwritable(tmp_path):
    wiki_base = tmp_path / "wiki"
    wiki_base.mkdir()
    global_dir = wiki_base / "global"
    global_dir.mkdir()
    # Make the global dir non-writable
    global_dir.chmod(0o500)  # r-x------
    try:
        result = _run_script(wiki_base)
        # exit 2 = precondition failure per script docstring
        assert result.returncode == 2, f"expected 2, got {result.returncode}: {result.stderr}"
        assert "not writable" in result.stderr
    finally:
        # Restore so pytest cleanup can remove the dir
        global_dir.chmod(0o700)
