#!/usr/bin/env bash
# ============================================================
# second-pc: 원격 노드(main-pc) 연결 스크립트
# 실행: bash scripts/connect-remote-node.sh <REMOTE_IP>
# 예시: bash scripts/connect-remote-node.sh 100.121.211.106
#
# 목적:
#   - 원격 노드 헬스 확인
#   - musu-port를 MUSU_PORT_PEERS 설정으로 재시작
#   - musu-bee 환경변수에 MUSU_BRIDGE_REMOTE_URL 주입
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[connect-remote]${NC} $*"; }
warn() { echo -e "${YELLOW}[connect-remote]${NC} $*"; }
err()  { echo -e "${RED}[connect-remote]${NC} $*"; exit 1; }

REMOTE_IP="${1:-}"
if [[ -z "$REMOTE_IP" ]]; then
    # nodes.toml에서 읽기 시도
    NODES_TOML="${ROOT}/musu-port/nodes.toml"
    if [[ -f "$NODES_TOML" ]]; then
        REMOTE_IP=$(grep -E '^\s*ip\s*=' "$NODES_TOML" | head -1 | sed 's/.*=\s*"\(.*\)".*/\1/' || true)
    fi
    if [[ -z "$REMOTE_IP" ]]; then
        err "사용법: $0 <REMOTE_IP>\n  예: $0 100.121.211.106"
    fi
fi

REMOTE_BRIDGE="http://${REMOTE_IP}:8070"
REMOTE_PORT="http://${REMOTE_IP}:1355"

# ── 1. 원격 노드 헬스 확인 ──────────────────────────────────
log "원격 노드 확인 중: ${REMOTE_IP}"

if ! curl -sf --max-time 5 "${REMOTE_BRIDGE}/health" >/dev/null 2>&1; then
    err "원격 브리지 접속 실패: ${REMOTE_BRIDGE}/health\n\n  main-pc에서 먼저 실행하세요:\n    bash scripts/setup-main-pc-remote.sh"
fi
log "✅ 원격 브리지 정상: ${REMOTE_BRIDGE}"

REMOTE_PORT_OK=false
if curl -sf --max-time 5 "${REMOTE_PORT}/health" >/dev/null 2>&1; then
    log "✅ 원격 musu-port 정상: ${REMOTE_PORT}"
    REMOTE_PORT_OK=true
else
    warn "⚠️  원격 musu-port 아직 준비 안 됨 (${REMOTE_PORT}) — 브리지만으로 계속 진행"
fi

# ── 2. musu-bee .env.local 업데이트 ─────────────────────────
BEE_ENV="${ROOT}/musu-bee/.env.local"

# 기존 MUSU_BRIDGE_REMOTE_URL 라인 제거 후 새로 추가
if [[ -f "$BEE_ENV" ]]; then
    sed -i '/^MUSU_BRIDGE_REMOTE_URL=/d' "$BEE_ENV"
    sed -i '/^MUSU_PORT_PEERS=/d' "$BEE_ENV"
fi

{
    echo "MUSU_BRIDGE_REMOTE_URL=${REMOTE_BRIDGE}"
    echo "MUSU_PORT_PEERS=${REMOTE_PORT}"
} >> "$BEE_ENV"

log ".env.local 업데이트:"
log "  MUSU_BRIDGE_REMOTE_URL=${REMOTE_BRIDGE}"
log "  MUSU_PORT_PEERS=${REMOTE_PORT}"

# ── 3. 로컬 musu-port 재시작 (MUSU_PORT_PEERS 반영) ─────────
LOCAL_PORTD="${ROOT}/musu-port/target/release/musu-portd"
if [[ -f "$LOCAL_PORTD" ]]; then
    EXISTING_PID=$(pgrep -f "musu-portd" | head -1 || true)
    if [[ -n "$EXISTING_PID" ]]; then
        log "로컬 musu-port 재시작 (pid=${EXISTING_PID})..."
        kill "$EXISTING_PID" 2>/dev/null || true
        sleep 2
    fi
    MUSU_PORT_MANAGER_HOST=0.0.0.0 \
    MUSU_PORT_PEERS="${REMOTE_PORT}" \
    MUSU_BRIDGE_URL="http://localhost:8070" \
        nohup "$LOCAL_PORTD" >> "${ROOT}/logs/musu-port.log" 2>&1 &
    sleep 2
    if curl -sf --max-time 3 "http://127.0.0.1:1355/health" >/dev/null 2>&1; then
        log "✅ 로컬 musu-port 재시작 완료 (:1355)"
    else
        warn "로컬 musu-port 시작 실패 — logs/musu-port.log 확인"
    fi
else
    warn "musu-portd 바이너리 없음 — 빌드 후 재시도: cd musu-port && cargo build --release"
fi

# ── 4. peers 확인 ───────────────────────────────────────────
echo ""
log "=== 연결 상태 확인 ==="
echo ""
echo "로컬 peers:"
curl -s --max-time 3 "http://localhost:1355/peers" 2>/dev/null | python3 -m json.tool 2>/dev/null || echo "  (musu-port 미실행)"
echo ""

if $REMOTE_PORT_OK; then
    echo "원격 peers:"
    curl -s --max-time 3 "${REMOTE_PORT}/peers" 2>/dev/null | python3 -m json.tool 2>/dev/null || echo "  (접속 실패)"
fi

echo ""
log "=== delegate_task E2E 테스트 ==="
echo ""
echo "musu-bee 재시작:"
echo "  cd musu-bee && npm run dev"
echo ""
echo "또는 MCP 직접 테스트:"
echo "  /mcp → mcp__musu-control__delegate_task channel=engineer instruction='Hello from second-pc'"
