#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

MUSU_RUN_DIR="${MUSU_RUN_DIR:-$HOME/.musu/run}"
MUSU_LOG_DIR="${MUSU_LOG_DIR:-$HOME/.musu/logs}"

HOST="${MUSU_WORKER_HOST:-0.0.0.0}"
PORT="${MUSU_WORKER_PORT:-9700}"

PID_FILE="${MUSU_WORKER_PID_FILE:-$MUSU_RUN_DIR/musu-worker-${PORT}.pid}"
LOG_FILE="${MUSU_WORKER_LOG_FILE:-$MUSU_LOG_DIR/musu-worker-${PORT}.log}"

usage() {
  printf 'Usage: %s <start|stop|status|logs> [--health]\n\n' "$0"
  cat <<'EOF'
Environment:
  MUSU_WORKER_HOST        (default: 0.0.0.0)
  MUSU_WORKER_PORT        (default: 9700)
  MUSU_WORKER_TOKEN       (optional; if set, auth is required)
  MUSU_WORKER_PID_FILE    (default: ~/.musu/run/musu-worker-$PORT.pid)
  MUSU_WORKER_LOG_FILE    (default: ~/.musu/logs/musu-worker-$PORT.log)
EOF
}

is_running() {
  local pid=""
  if [[ -f "$PID_FILE" ]]; then
    pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  fi
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

start() {
  mkdir -p "$MUSU_RUN_DIR" "$MUSU_LOG_DIR"

  if is_running; then
    echo "musu-worker already running (pid=$(cat "$PID_FILE"))"
    return 0
  fi

  echo "Starting musu-worker on ${HOST}:${PORT}"
  nohup env MUSU_WORKER_HOST="$HOST" MUSU_WORKER_PORT="$PORT" MUSU_WORKER_TOKEN="${MUSU_WORKER_TOKEN:-}" \
    "${ROOT_DIR}/scripts/start-worker.sh" >>"$LOG_FILE" 2>&1 &
  echo $! >"$PID_FILE"
  echo "pid=$! log=$LOG_FILE"
}

stop() {
  if ! [[ -f "$PID_FILE" ]]; then
    echo "Not running (no pid file: $PID_FILE)"
    return 0
  fi

  local pid
  pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -z "$pid" ]]; then
    rm -f "$PID_FILE"
    echo "Not running (empty pid file)"
    return 0
  fi

  if ! kill -0 "$pid" 2>/dev/null; then
    rm -f "$PID_FILE"
    echo "Not running (stale pid=$pid)"
    return 0
  fi

  echo "Stopping pid=$pid"
  kill "$pid"
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    if ! kill -0 "$pid" 2>/dev/null; then
      rm -f "$PID_FILE"
      echo "Stopped"
      return 0
    fi
    sleep 0.2
  done

  echo "Still running after 2s; sending SIGKILL"
  kill -9 "$pid" 2>/dev/null || true
  rm -f "$PID_FILE"
  echo "Killed"
}

status() {
  if is_running; then
    echo "running pid=$(cat "$PID_FILE") host=${HOST} port=${PORT}"
  else
    echo "not running host=${HOST} port=${PORT}"
    return 1
  fi
}

logs() {
  if [[ -f "$LOG_FILE" ]]; then
    tail -n 200 "$LOG_FILE"
  else
    echo "no log file: $LOG_FILE"
    return 1
  fi
}

health() {
  curl -sf --max-time 2 "http://127.0.0.1:${PORT}/health"
  echo
}

cmd="${1:-}"
shift || true

case "$cmd" in
  start) start ;;
  stop) stop ;;
  status) status ;;
  logs) logs ;;
  ""|-h|--help|help) usage; exit 2 ;;
  *) echo "Unknown command: $cmd" >&2; usage; exit 2 ;;
esac

if [[ "${1:-}" == "--health" ]]; then
  health
fi
