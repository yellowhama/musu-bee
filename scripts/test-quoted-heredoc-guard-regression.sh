#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GUARD_SCRIPT="$ROOT_DIR/scripts/check-quoted-heredoc-guard.sh"

tmpdir="$(mktemp -d)"
cleanup() {
  rm -rf "$tmpdir"
}
trap cleanup EXIT

safe_file="$tmpdir/safe.sh"
unsafe_file="$tmpdir/unsafe.sh"

cat >"$safe_file" <<'EOF'
#!/usr/bin/env bash
cat <<'EOF_TEXT'
safe
EOF_TEXT
EOF

cat >"$unsafe_file" <<'UNSAFE_FIXTURE'
#!/usr/bin/env bash
cat <<EOF
unsafe
EOF
UNSAFE_FIXTURE

run_case() {
  local name="$1"
  local expected_exit="$2"
  local expected_substring="$3"
  shift 3

  set +e
  local output
  output="$("$@" 2>&1)"
  local exit_code=$?
  set -e

  if [[ $exit_code -ne $expected_exit ]]; then
    echo "[FAIL] $name: expected exit $expected_exit, got $exit_code" >&2
    echo "$output" >&2
    exit 1
  fi

  if [[ "$output" != *"$expected_substring"* ]]; then
    echo "[FAIL] $name: expected output to contain: $expected_substring" >&2
    echo "$output" >&2
    exit 1
  fi

  echo "[PASS] $name (exit=$exit_code)"
}

run_case "safe-path" 0 "[PASS] quoted heredoc guard" "$GUARD_SCRIPT" "$safe_file"
run_case "unsafe-path" 1 "[FAIL] unsafe heredoc opener(s) detected" "$GUARD_SCRIPT" "$unsafe_file"
run_case "scanner-error-path" 2 "[FAIL] heredoc guard scanner failed" env HEREDOC_GUARD_PATTERN_OVERRIDE='(?invalid' "$GUARD_SCRIPT" "$safe_file"

echo "[PASS] quoted heredoc guard regression tests"
