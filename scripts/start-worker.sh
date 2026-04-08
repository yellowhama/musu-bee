#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

export PYTHONPATH="${ROOT_DIR}/musu-core/src:${ROOT_DIR}/musu-worker/src"

export MUSU_WORKER_HOST="${MUSU_WORKER_HOST:-0.0.0.0}"
export MUSU_WORKER_PORT="${MUSU_WORKER_PORT:-9700}"

cd "${ROOT_DIR}/musu-worker"

PY_BIN="python3"
if [[ -x "${ROOT_DIR}/musu-worker/.venv/bin/python" ]]; then
  PY_BIN="${ROOT_DIR}/musu-worker/.venv/bin/python"
fi

exec "${PY_BIN}" -m musu_worker.main
