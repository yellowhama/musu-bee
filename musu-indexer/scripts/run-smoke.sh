#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PYTHONPATH="$ROOT/src"

echo "[1/11] compileall"
python3 -m compileall "$ROOT/src/musu_indexer" "$ROOT/tests" >/dev/null

echo "[2/11] unittest"
python3 -m unittest discover -s "$ROOT/tests" -v

echo "[3/11] sync all scope"
python3 -m musu_indexer.cli sync --scope all --root "$ROOT" >/dev/null

echo "[4/11] sync doc scope"
python3 -m musu_indexer.cli sync --scope doc --root "$ROOT" >/dev/null

echo "[5/11] search"
SEARCH_OUTPUT="$(python3 -m musu_indexer.cli search "Musu Indexer" --limit 3 --root "$ROOT")"
test -n "$SEARCH_OUTPUT"

echo "[6/11] index sanity"
python3 - <<'PY'
from pathlib import Path
from musu_indexer.core import get_db

root = Path.cwd()
conn = get_db(root)
files = conn.execute("SELECT COUNT(*) FROM files").fetchone()[0]
symbols = conn.execute("SELECT COUNT(*) FROM code_symbols").fetchone()[0]
conn.close()
assert files > 0, "expected indexed files > 0"
assert symbols > 0, "expected indexed code symbols > 0"
PY

echo "[7/11] cleanup dry-run"
python3 -m musu_indexer.cli cleanup --dry-run --root "$ROOT"

echo "[8/11] session persistence"
SESSION_OUTPUT="$(python3 -m musu_indexer.cli session start pty printf smoke-session --root "$ROOT")"
SESSION_ID="$(printf '%s\n' "$SESSION_OUTPUT" | awk '{print $NF}')"
sleep 1
SESSION_STATUS="$(python3 -m musu_indexer.cli session status "$SESSION_ID" --root "$ROOT")"
printf '%s' "$SESSION_STATUS" | grep -q "status: completed"
HISTORY_OUTPUT="$(python3 -m musu_indexer.cli session history --limit 5 --root "$ROOT")"
printf '%s' "$HISTORY_OUTPUT" | grep -q "$SESSION_ID"

echo "[9/11] runs"
python3 -m musu_indexer.cli runs --limit 3 --root "$ROOT"

echo "[10/11] session list"
python3 -m musu_indexer.cli session list --root "$ROOT"

echo "[11/11] cleanup session history dry path"
python3 -m musu_indexer.cli session cleanup-history --hours 1 --root "$ROOT" >/dev/null

echo "smoke complete"
