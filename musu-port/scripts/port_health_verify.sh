#!/usr/bin/env bash
set -euo pipefail

URL="${1:-http://127.0.0.1:24680/health}"
SAMPLE_OUT="${2:-}"
TIMEOUT_SEC="${MUSU_HEALTH_VERIFY_TIMEOUT_SEC:-10}"
TMP_JSON="$(mktemp)"
trap 'rm -f "$TMP_JSON"' EXIT

curl -fsS --max-time "$TIMEOUT_SEC" "$URL" >"$TMP_JSON"

if [ -n "$SAMPLE_OUT" ]; then
  mkdir -p "$(dirname "$SAMPLE_OUT")"
  cp "$TMP_JSON" "$SAMPLE_OUT"
fi

python3 - "$TMP_JSON" "$URL" <<'PY'
import json
import sys
from typing import Any

payload_path = sys.argv[1]
url = sys.argv[2]

with open(payload_path, "r", encoding="utf-8") as f:
    payload = json.load(f)

required = [
    "status",
    "cpu_pct",
    "ram_used",
    "ram_total",
    "gpu_util",
    "gpu_mem_used",
    "gpu_mem_total",
    "queue_depth",
]

missing = [key for key in required if key not in payload]
if missing:
    raise SystemExit(f"FAIL missing keys: {', '.join(missing)}")


def require_number(name: str, value: Any) -> None:
    if not isinstance(value, (int, float)):
        raise SystemExit(f"FAIL {name} must be a number, got {type(value).__name__}")


def require_u64(name: str, value: Any) -> None:
    if not isinstance(value, int) or value < 0:
        raise SystemExit(f"FAIL {name} must be a non-negative integer, got {value!r}")


if not isinstance(payload["status"], str) or not payload["status"]:
    raise SystemExit("FAIL status must be a non-empty string")

require_number("cpu_pct", payload["cpu_pct"])
require_u64("ram_used", payload["ram_used"])
require_u64("ram_total", payload["ram_total"])
require_u64("queue_depth", payload["queue_depth"])

if payload["ram_total"] == 0:
    raise SystemExit("FAIL ram_total must be > 0")
if payload["ram_used"] > payload["ram_total"]:
    raise SystemExit(
        f"FAIL ram_used ({payload['ram_used']}) must be <= ram_total ({payload['ram_total']})"
    )

gpu_util = payload["gpu_util"]
gpu_mem_used = payload["gpu_mem_used"]
gpu_mem_total = payload["gpu_mem_total"]

if gpu_util is not None:
    require_number("gpu_util", gpu_util)
if gpu_mem_used is not None:
    require_u64("gpu_mem_used", gpu_mem_used)
if gpu_mem_total is not None:
    require_u64("gpu_mem_total", gpu_mem_total)
if gpu_mem_used is not None and gpu_mem_total is not None and gpu_mem_used > gpu_mem_total:
    raise SystemExit(
        f"FAIL gpu_mem_used ({gpu_mem_used}) must be <= gpu_mem_total ({gpu_mem_total})"
    )

summary = {
    "url": url,
    "status": payload["status"],
    "cpu_pct": round(float(payload["cpu_pct"]), 2),
    "ram_used": payload["ram_used"],
    "ram_total": payload["ram_total"],
    "gpu_util": payload["gpu_util"],
    "gpu_mem_used": payload["gpu_mem_used"],
    "gpu_mem_total": payload["gpu_mem_total"],
    "queue_depth": payload["queue_depth"],
}
print("PASS /health v0.2 shape:")
print(json.dumps(summary, ensure_ascii=True, sort_keys=True))
PY
