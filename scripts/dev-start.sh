#!/usr/bin/env bash
# MUSU 전체 스택 개발 시작 스크립트
# 사용: bash scripts/dev-start.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
LOG_DIR="${ROOT}/logs"
mkdir -p "$LOG_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[dev-start]${NC} $*"; }
warn() { echo -e "${YELLOW}[dev-start]${NC} $*"; }
err()  { echo -e "${RED}[dev-start]${NC} $*"; }

# ── 헬스체크 유틸 ────────────────────────────────────────────────────────────

wait_for_port() {
  local name="$1" port="$2" max="${3:-10}"
  local i=0
  while ! curl -sf --max-time 1 "http://127.0.0.1:${port}/health" >/dev/null 2>&1; do
    if [[ $i -ge $max ]]; then
      warn "${name} health check timed out after ${max}s — continuing anyway"
      return 1
    fi
    sleep 1
    ((i++))
  done
  log "${name} ready on :${port}"
}

# ── musu-port (Rust) ─────────────────────────────────────────────────────────

start_musu_port() {
  local port_dir="${ROOT}/musu-port"
  local seed_file="${port_dir}/data/seed-services.json"

  if [[ ! -d "$port_dir" ]]; then
    warn "musu-port directory not found at ${port_dir} — skipping"
    return
  fi

  # seed 변경 감지: 실행 중이면 checksum 비교 후 재시작 여부 결정
  if curl -sf --max-time 1 "http://127.0.0.1:1355/health" >/dev/null 2>&1; then
    local seed_sum_file="${LOG_DIR}/.musu-port-seed.md5"
    local current_sum=""
    local prev_sum=""
    [[ -f "$seed_file" ]] && current_sum=$(md5sum "$seed_file" 2>/dev/null | cut -d' ' -f1)
    [[ -f "$seed_sum_file" ]] && prev_sum=$(cat "$seed_sum_file")

    if [[ -n "$current_sum" && "$current_sum" != "$prev_sum" ]]; then
      warn "musu-port seed 변경 감지 — 재시작..."
      pkill -f "musu-portd" 2>/dev/null || true
      sleep 1
      echo "$current_sum" > "$seed_sum_file"
    else
      log "musu-port already running on :1355"
      return
    fi
  fi

  log "Starting musu-port..."
  (
    cd "$port_dir"
    local seed_args=""
    [[ -f "$seed_file" ]] && seed_args="--seed-services ${seed_file}"
    if [[ -f "target/release/musu-portd" ]]; then
      # shellcheck disable=SC2086
      MUSU_PORT_SEED_SERVICES="${seed_file}" \
        ./target/release/musu-portd >> "${LOG_DIR}/musu-port.log" 2>&1 &
    else
      log "musu-portd binary not found — building (this will take ~2 min)..."
      if ! cargo build --release >> "${LOG_DIR}/musu-port.log" 2>&1; then
        err "musu-portd build failed — check ${LOG_DIR}/musu-port.log"
        return 1
      fi
      MUSU_PORT_SEED_SERVICES="${seed_file}" \
        ./target/release/musu-portd >> "${LOG_DIR}/musu-port.log" 2>&1 &
    fi
  )
  # checksum 저장
  [[ -f "$seed_file" ]] && md5sum "$seed_file" 2>/dev/null | cut -d' ' -f1 > "${LOG_DIR}/.musu-port-seed.md5"
  wait_for_port "musu-port" 1355 15 || true
}

# ── musu-bridge (Python) ─────────────────────────────────────────────────────

start_musu_bridge() {
  if curl -sf --max-time 1 "http://127.0.0.1:8070/health" >/dev/null 2>&1; then
    log "musu-bridge already running on :8070"
    return
  fi

  local bridge_dir="${ROOT}/musu-bridge"
  if [[ ! -d "$bridge_dir" ]]; then
    warn "musu-bridge directory not found at ${bridge_dir} — skipping"
    return
  fi

  log "Starting musu-bridge..."
  (
    export MUSU_DEV="${MUSU_DEV:-1}"  # dev-start는 기본적으로 dev 모드
    export PYTHONPATH="${ROOT}/musu-core/src:${bridge_dir}:${PYTHONPATH:-}"
    cd "$bridge_dir"
    local py="python3"
    [[ -x ".venv/bin/python" ]] && py=".venv/bin/python"
    "$py" server.py >> "${LOG_DIR}/musu-bridge.log" 2>&1 &
  )
  wait_for_port "musu-bridge" 8070 10 || true
}

# ── musu-worker (Python) ─────────────────────────────────────────────────────

start_musu_worker() {
  if curl -sf --max-time 1 "http://127.0.0.1:9700/health" >/dev/null 2>&1; then
    log "musu-worker already running on :9700"
    return
  fi

  log "Starting musu-worker..."
  bash "${SCRIPT_DIR}/start-worker.sh" >> "${LOG_DIR}/musu-worker.log" 2>&1 &
  wait_for_port "musu-worker" 9700 10 || true
}

# ── Paperclip 감지 (선택적 고급 백엔드) ─────────────────────────────────────

detect_paperclip() {
  local url="${PAPERCLIP_API_URL:-http://127.0.0.1:3100}"
  if curl -sf --max-time 2 "${url}/api/health" >/dev/null 2>&1; then
    log "Paperclip 감지됨 (${url}) — PaperclipBackend 모드"
    export PAPERCLIP_API_URL="${url}"
    # PAPERCLIP_API_KEY, PAPERCLIP_COMPANY_ID 는 .env.local 또는 쉘 환경에서 설정
    if [[ -z "${PAPERCLIP_API_KEY:-}" ]]; then
      warn "PAPERCLIP_API_KEY 미설정 — musu-bridge가 API 키 없이 Paperclip에 연결을 시도합니다"
    fi
  else
    log "Paperclip 없음 — LocalBackend 모드로 동작 (기본값)"
  fi
}

# ── musu-bee (Next.js) ───────────────────────────────────────────────────────

start_musu_bee() {
  log "Starting musu-bee on :3001..."
  cd "${ROOT}/musu-bee"
  exec pnpm dev --port "${BEE_PORT:-3001}" --hostname "${BEE_HOST:-0.0.0.0}"
}

# ── 메인 ─────────────────────────────────────────────────────────────────────

log "=== MUSU Dev Stack Starting ==="
log "Logs: ${LOG_DIR}/"

detect_paperclip
start_musu_port
start_musu_bridge
start_musu_worker

echo ""
bash "${SCRIPT_DIR}/check-services.sh" || true
echo ""

start_musu_bee
