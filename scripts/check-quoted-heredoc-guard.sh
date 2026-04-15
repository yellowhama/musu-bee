#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v rg >/dev/null 2>&1; then
  echo "[FAIL] ripgrep (rg) is required for heredoc guard checks." >&2
  exit 2
fi

if (( $# > 0 )); then
  SCOPED_FILES=("$@")
else
  # MUS-1363 + MUS-1368 scope: shell flows touched by SEC hardening,
  # including Paperclip board/comment automation scripts.
  SCOPED_FILES=(
    "$ROOT_DIR/scripts/mus28-crt-remote-smoke.sh"
    "$ROOT_DIR/scripts/install-musu-worker-service.sh"
    "$ROOT_DIR/scripts/mus27-live-session-harness.sh"
    "$ROOT_DIR/scripts/workerctl.sh"
    "$ROOT_DIR/scripts/mus71-dual-gpu-chain-harness.sh"
    "$ROOT_DIR/scripts/deploy-qwen14b-machine-b.sh"
    "$ROOT_DIR/scripts/mus55-operator-oneflow-harness.sh"
    "$ROOT_DIR/scripts/paperclip_post_ceo_action_comment_2026-04-09.sh"
    "$ROOT_DIR/scripts/paperclip_put_unblock_plans_2026-04-09.sh"
  )
fi

PATTERN="${HEREDOC_GUARD_PATTERN_OVERRIDE:-}"
if [[ -z "$PATTERN" ]]; then
  PATTERN="<<-?\\s*(?!['\\\"])(EOF|JSON|MD)\\b"
fi

match_file="$(mktemp)"
err_file="$(mktemp)"
cleanup() {
  rm -f "$match_file" "$err_file"
}
trap cleanup EXIT

set +e
rg -nP "$PATTERN" "${SCOPED_FILES[@]}" >"$match_file" 2>"$err_file"
rg_exit=$?
set -e

if [[ $rg_exit -eq 0 ]]; then
  echo "[FAIL] unsafe heredoc opener(s) detected in scoped files:" >&2
  cat "$match_file" >&2
  exit 1
fi

if [[ $rg_exit -eq 1 ]]; then
  echo "[PASS] quoted heredoc guard: no unsafe opener in scoped files (${#SCOPED_FILES[@]} files)."
  exit 0
fi

echo "[FAIL] heredoc guard scanner failed (rg exit=$rg_exit)." >&2
if [[ -s "$err_file" ]]; then
  cat "$err_file" >&2
fi
exit 2
