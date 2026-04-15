#!/usr/bin/env bash
set -euo pipefail
OUT_STD="$1"
OUT_ERR="$2"
MATRIX="$3"
npm run dev >"$OUT_STD" 2>"$OUT_ERR" &
PID=$!
cleanup() {
  kill "$PID" >/dev/null 2>&1 || true
  wait "$PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT
sleep 7
{
  echo -e 'timestamp\troute\thttp_code\tbytes';
  for r in landing pricing pro faq install; do
    ts=$(date -Iseconds)
    code=$(curl -s -o "${MATRIX%.*}_${r}.html" -w '%{http_code}' "http://127.0.0.1:3001/$r" || true)
    bytes=$(wc -c < "${MATRIX%.*}_${r}.html" | tr -d ' ')
    echo -e "${ts}\t/${r}\t${code}\t${bytes}";
  done
} > "$MATRIX"
sleep 2
