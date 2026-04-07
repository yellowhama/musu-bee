#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${1:-$ROOT_DIR/work/mus28-crt-remote-smoke}"
NOW="${MUSU_LANE3_NOW:-$(date -u +"%Y-%m-%dT%H:%M:%SZ")}"

# Guard: musu-port workspace must be present and a musu-portd instance must be
# reachable (or startable) before this smoke can succeed.  mus27 will attempt to
# start musu-portd via `cargo run -p musu-portd`; if the workspace is missing the
# build will fail with an opaque error.  Fail here with a clear message instead.
PORT="${MUSU_LANE2_PORT:-18495}"
if [[ ! -d "$ROOT_DIR/musu-port" ]]; then
  echo "[FAIL] musu-port workspace not found at $ROOT_DIR/musu-port" >&2
  echo "       musu-port must be present before running mus28 smoke." >&2
  exit 1
fi
if [[ ! -f "$ROOT_DIR/musu-port/Cargo.toml" ]]; then
  echo "[FAIL] $ROOT_DIR/musu-port/Cargo.toml not found" >&2
  echo "       musu-port workspace appears incomplete — cannot build musu-portd." >&2
  exit 1
fi
if [[ ! -f "$ROOT_DIR/scripts/linux-rust-env.sh" ]]; then
  echo "[FAIL] $ROOT_DIR/scripts/linux-rust-env.sh not found" >&2
  echo "       Rust environment script is required to build and start musu-portd." >&2
  exit 1
fi
# Preflight health check: if musu-portd is already listening on PORT, that is a
# conflict — mus27 will try to bind the same port and fail.  Detect early.
if curl -fsS --max-time 1 "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then
  echo "[FAIL] A process is already listening on port $PORT." >&2
  echo "       Stop the existing musu-portd instance before running mus28 smoke." >&2
  exit 1
fi

LANE2_DIR="$OUT_DIR/mus27-live-harness"
LANE2_PROOF="$LANE2_DIR/musu-connects-live-proof.json"
SUMMARY_JSON="$OUT_DIR/summary.json"
OPERATOR_VIEW_JSON="$OUT_DIR/operator-view.json"
MANIFEST_JSON="$OUT_DIR/mus28-crt-remote-smoke-manifest.json"

mkdir -p "$OUT_DIR"

"$ROOT_DIR/scripts/mus27-live-session-harness.sh" "$LANE2_DIR"

node "$ROOT_DIR/MUSU-CRT/tools/mus28_crt_remote_read_proof.mjs" \
  --lane2-proof "$LANE2_PROOF" \
  --summary-json "$SUMMARY_JSON" \
  --operator-view-json "$OPERATOR_VIEW_JSON"

cat >"$MANIFEST_JSON" <<JSON
{
  "harness": "mus28-crt-remote-smoke",
  "generated_at": "$NOW",
  "artifacts": {
    "lane2_proof": "$LANE2_PROOF",
    "summary": "$SUMMARY_JSON",
    "operator_view": "$OPERATOR_VIEW_JSON"
  }
}
JSON

echo "[OK] MUS-28 CRT remote smoke artifacts generated"
echo "  - lane2 proof:    $LANE2_PROOF"
echo "  - summary:        $SUMMARY_JSON"
echo "  - operator view:  $OPERATOR_VIEW_JSON"
echo "  - manifest:       $MANIFEST_JSON"
