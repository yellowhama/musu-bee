#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

export PYTHONPATH="${ROOT_DIR}/musu-core/src:${ROOT_DIR}/musu-worker/src"

export MUSU_WORKER_HOST="${MUSU_WORKER_HOST:-0.0.0.0}"
export MUSU_WORKER_PORT="${MUSU_WORKER_PORT:-9700}"

TOKEN_FILE_DEFAULT="${HOME}/.musu/worker_token"
export MUSU_WORKER_TOKEN_FILE="${MUSU_WORKER_TOKEN_FILE:-${TOKEN_FILE_DEFAULT}}"

if [[ -z "${MUSU_WORKER_TOKEN:-}" && -f "${MUSU_WORKER_TOKEN_FILE}" ]]; then
  export MUSU_WORKER_TOKEN="$(tr -d '\n' < "${MUSU_WORKER_TOKEN_FILE}")"
fi

worker_healthcheck() {
  local url="http://127.0.0.1:${MUSU_WORKER_PORT}/health"
  if command -v curl >/dev/null 2>&1; then
    curl -sf --max-time 1 "${url}" >/dev/null 2>&1
    return $?
  fi
  return 1
}

if worker_healthcheck; then
  echo "musu-worker already running: http://127.0.0.1:${MUSU_WORKER_PORT}"
  exit 0
fi

if command -v ss >/dev/null 2>&1; then
  if ss -ltn "sport = :${MUSU_WORKER_PORT}" 2>/dev/null | tail -n +2 | grep -q .; then
    echo "port ${MUSU_WORKER_PORT} is already in use, but /health is not responding."
    echo "Either stop the existing listener or set MUSU_WORKER_PORT to a different port."
    echo "Tip: ss -ltnp | grep :${MUSU_WORKER_PORT} || true"
    exit 1
  fi
fi

cd "${ROOT_DIR}/musu-worker"

PY_BIN="python3"
if [[ -x "${ROOT_DIR}/musu-worker/.venv/bin/python" ]]; then
  PY_BIN="${ROOT_DIR}/musu-worker/.venv/bin/python"
fi

exec "${PY_BIN}" -m musu_worker.main
