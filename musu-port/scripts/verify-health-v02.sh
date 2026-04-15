#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULT_FILES=(
  "$ROOT_DIR/fixtures/health-v0.2/5070ti.health.json"
  "$ROOT_DIR/fixtures/health-v0.2/4060ti.health.json"
)

usage() {
  cat <<'USAGE'
Usage:
  scripts/verify-health-v02.sh [json_file ...]

Validates /health v0.2 telemetry payload shape:
  - cpu_pct (number)
  - ram_used (number)
  - ram_total (number)
  - queue_depth (number)
  - gpu_util (number|null)
  - gpu_mem_used (number|null)
  - gpu_mem_total (number|null)

If no files are provided, verifies default fixture files:
  - fixtures/health-v0.2/5070ti.health.json
  - fixtures/health-v0.2/4060ti.health.json
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

declare -a files
if [[ "$#" -gt 0 ]]; then
  files=("$@")
else
  files=("${DEFAULT_FILES[@]}")
fi

exit_code=0
for file in "${files[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "[FAIL] missing file: $file" >&2
    exit_code=1
    continue
  fi

  if ! jq -e '.' "$file" >/dev/null 2>&1; then
    echo "[FAIL] invalid JSON: $file" >&2
    exit_code=1
    continue
  fi

  if jq -e '.. | strings | select(startswith("[TBD: awaiting real data]"))' "$file" >/dev/null; then
    echo "[FAIL] unresolved placeholder found: $file" >&2
    exit_code=1
    continue
  fi

  if ! jq -e '
      def payload: if (type == "object" and has("health") and (.health | type == "object")) then .health else . end;
      payload as $p
      | ($p.cpu_pct | type) == "number"
      and ($p.ram_used | type) == "number"
      and ($p.ram_total | type) == "number"
      and ($p.queue_depth | type) == "number"
      and (($p.gpu_util | type) == "number" or ($p.gpu_util | type) == "null")
      and (($p.gpu_mem_used | type) == "number" or ($p.gpu_mem_used | type) == "null")
      and (($p.gpu_mem_total | type) == "number" or ($p.gpu_mem_total | type) == "null")
    ' "$file" >/dev/null; then
    echo "[FAIL] schema mismatch: $file" >&2
    exit_code=1
    continue
  fi

  echo "[OK] $file"
done

exit "$exit_code"
