#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
RUST_ENV="$ROOT_DIR/scripts/linux-rust-env.sh"

pass_count=0
fail_count=0
info_count=0

run_step() {
  local id="$1"
  local lane="$2"
  local expectation="$3"
  local cwd="$4"
  local command="$5"
  local tmp
  local status

  tmp="$(mktemp)"
  if (cd "$cwd" && bash -lc "$command") >"$tmp" 2>&1; then
    status=0
  else
    status=$?
  fi

  case "$expectation" in
    pass)
      if [[ "$status" -eq 0 ]]; then
        printf '[PASS] %s [%s] %s\n' "$id" "$lane" "$command"
        pass_count=$((pass_count + 1))
      else
        printf '[FAIL] %s [%s] %s (exit=%s)\n' "$id" "$lane" "$command" "$status"
        fail_count=$((fail_count + 1))
      fi
      ;;
    fail)
      if [[ "$status" -ne 0 ]]; then
        printf '[EXPECTED_FAIL] %s [%s] %s\n' "$id" "$lane" "$command"
        pass_count=$((pass_count + 1))
      else
        printf '[INFO] %s [%s] %s unexpectedly passed\n' "$id" "$lane" "$command"
        info_count=$((info_count + 1))
      fi
      ;;
    report)
      printf '[INFO] %s [%s] %s\n' "$id" "$lane" "$command"
      info_count=$((info_count + 1))
      ;;
    *)
      echo "unknown expectation: $expectation" >&2
      rm -f "$tmp"
      exit 2
      ;;
  esac

  sed -n '1,12p' "$tmp" | sed 's/^/  /'
  rm -f "$tmp"
}

run_step "A1" "code-health" "pass" "$ROOT_DIR/MUSU-AS-MCP" "npm run -s check"
run_step "A2" "code-health" "pass" "$ROOT_DIR/musu-indexer" "python3 -m compileall -q src/musu_indexer"
run_step "B0" "toolchain" "report" "$ROOT_DIR" "env PATH=/usr/bin:/bin cargo --version && $RUST_ENV cargo --version"
run_step "B1" "toolchain-negative-control" "fail" "$ROOT_DIR/musu-connects" "env PATH=/usr/bin:/bin cargo check -p musu-connects-core"
run_step "B2" "toolchain-negative-control" "fail" "$ROOT_DIR/musu-port" "env PATH=/usr/bin:/bin cargo check -p musu-port-core"
run_step "B3" "toolchain-canonical" "pass" "$ROOT_DIR/musu-connects" "$RUST_ENV cargo check -p musu-connects-core"
run_step "B4" "toolchain-canonical" "pass" "$ROOT_DIR/musu-port" "$RUST_ENV cargo check -p musu-port-core"
run_step "B5" "toolchain-canonical" "pass" "$ROOT_DIR/musu-connects" "$RUST_ENV cargo test -p musu-connects-core --no-run"
run_step "B6" "toolchain-canonical" "pass" "$ROOT_DIR/musu-port" "$RUST_ENV cargo test -p musu-port-core --no-run"

printf '\nSummary: pass=%s fail=%s info=%s\n' "$pass_count" "$fail_count" "$info_count"

if [[ "$fail_count" -ne 0 ]]; then
  exit 1
fi
