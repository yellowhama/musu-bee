#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

echo "=== Run Linkage Audit ==="
# Try to use tsx if available, otherwise fallback to ts-node
if command -v npx >/dev/null 2>&1; then
  (cd "$ROOT_DIR" && npx tsx audit_linkage.ts) || (cd "$ROOT_DIR" && npx ts-node audit_linkage.ts)
else
  echo "Error: npx not found. Cannot run audit_linkage.ts"
  exit 1
fi

echo ""
echo "=== musu-control Write Path Policy Tests ==="
if [ -d "$ROOT_DIR/musu-control" ]; then
  (cd "$ROOT_DIR/musu-control" && PYTHONPATH=src python3 -m pytest tests/test_server_write_path_policy.py)
else
  echo "Error: musu-control directory not found."
  exit 1
fi
