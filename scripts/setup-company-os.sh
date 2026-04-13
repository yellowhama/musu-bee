#!/usr/bin/env bash
# MUSU Company OS Setup
# 새 컴터에서 LocalBackend 기반 7 에이전트 등록 + 서비스 헬스체크
# 사용: bash scripts/setup-company-os.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${GREEN}[setup]${NC} $*"; }
warn() { echo -e "${YELLOW}[setup]${NC} $*"; }
err()  { echo -e "${RED}[setup]${NC} $*"; }
info() { echo -e "${BLUE}[setup]${NC} $*"; }

echo ""
echo -e "${BLUE}╔══════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   MUSU Company OS Setup              ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════╝${NC}"
echo ""

# ── 1. Python 환경 확인 ──────────────────────────────────────────────────────

log "Python 환경 확인..."

PYTHON="python3"
if [[ -x "${ROOT}/.venv/bin/python" ]]; then
    PYTHON="${ROOT}/.venv/bin/python"
    log "venv 사용: ${PYTHON}"
elif [[ -x "${ROOT}/musu-core/.venv/bin/python" ]]; then
    PYTHON="${ROOT}/musu-core/.venv/bin/python"
    log "musu-core venv 사용: ${PYTHON}"
fi

# musu-core import 확인
if ! PYTHONPATH="${ROOT}/musu-core/src" "$PYTHON" -c "from musu_core.backends.local import LocalBackend" 2>/dev/null; then
    warn "musu-core import 실패 — pip install 시도..."
    if ! "$PYTHON" -m pip install -e "${ROOT}/musu-core[dev]" -q; then
        err "musu-core 설치 실패. 수동 설치 후 재시도:"
        err "  cd ${ROOT} && python3 -m venv .venv && source .venv/bin/activate"
        err "  pip install -e musu-core[dev]"
        exit 1
    fi
fi

log "musu-core 확인됨 ✓"

# ── 2. 데이터베이스 디렉토리 생성 ────────────────────────────────────────────

MUSU_DB_PATH="${MUSU_DB_PATH:-${HOME}/.musu/musu.db}"
mkdir -p "$(dirname "$MUSU_DB_PATH")"
log "DB: ${MUSU_DB_PATH}"

# ── 3. 에이전트 시딩 ─────────────────────────────────────────────────────────

log "에이전트 등록 중..."
echo ""

PYTHONPATH="${ROOT}/musu-core/src" "$PYTHON" "${SCRIPT_DIR}/seed-agents.py" \
    --seeds "${SCRIPT_DIR}/agent-seeds.json" \
    --db "${MUSU_DB_PATH}"

echo ""

# ── 4. 에이전트 목록 확인 ────────────────────────────────────────────────────

log "등록된 에이전트:"
PYTHONPATH="${ROOT}/musu-core/src" "$PYTHON" "${SCRIPT_DIR}/seed-agents.py" \
    --seeds "${SCRIPT_DIR}/agent-seeds.json" \
    --db "${MUSU_DB_PATH}" \
    --list

echo ""

# ── 5. Paperclip 감지 (선택) ─────────────────────────────────────────────────

PAPERCLIP_URL="${PAPERCLIP_API_URL:-http://127.0.0.1:3100}"
if curl -sf --max-time 2 "${PAPERCLIP_URL}/api/health" >/dev/null 2>&1; then
    log "Paperclip 감지됨 (:3100) — 고급 오케스트레이션 사용 가능"
    info "  PAPERCLIP_API_URL, PAPERCLIP_API_KEY, PAPERCLIP_COMPANY_ID 환경변수 설정 시 자동 연결"
else
    info "Paperclip 없음 — LocalBackend 모드로 동작 (기본값)"
fi

# ── 6. musu-bee .env.local 확인 ──────────────────────────────────────────────

ENV_FILE="${ROOT}/musu-bee/.env.local"
ENV_EXAMPLE="${ROOT}/musu-bee/.env.local.example"

if [[ ! -f "$ENV_FILE" ]]; then
    if [[ -f "$ENV_EXAMPLE" ]]; then
        cp "$ENV_EXAMPLE" "$ENV_FILE"
        warn ".env.local 생성됨 — ANTHROPIC_API_KEY 입력 필요:"
        warn "  ${ENV_FILE}"
    fi
else
    if grep -q "your-anthropic-api-key-here" "$ENV_FILE" 2>/dev/null; then
        warn "ANTHROPIC_API_KEY가 아직 placeholder입니다:"
        warn "  ${ENV_FILE} 를 열어 실제 API 키를 입력하세요"
    else
        log ".env.local 확인됨 ✓"
    fi
fi

# ── 완료 ─────────────────────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
log "Company OS 설정 완료!"
echo ""
info "다음 단계:"
info "  1. bash scripts/dev-start.sh   # 전체 서비스 시작"
info "  2. http://localhost:3001        # Web UI 접속"
info "  3. /task '첫 번째 작업' 입력   # CEO에게 작업 지시"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo ""
