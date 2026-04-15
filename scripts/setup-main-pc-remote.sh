#!/usr/bin/env bash
# ============================================================
# main-pc: Tailscale 원격 접속 셋업
# 실행: bash scripts/setup-main-pc-remote.sh
#
# 목적:
#   - musu-bridge(:8070), musu-port(:1355)를 Tailscale IP로 외부에서
#     접근 가능하게 iptables/ufw 열기
#   - 브리지/포트 재시작 (0.0.0.0 바인딩 확인 포함)
#   - second-pc에서 curl로 health 확인하는 명령 출력
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[setup-remote]${NC} $*"; }
warn() { echo -e "${YELLOW}[setup-remote]${NC} $*"; }
err()  { echo -e "${RED}[setup-remote]${NC} $*"; }

# ── 1. Tailscale IP 감지 ────────────────────────────────────
TAILSCALE_IP=$(tailscale ip -4 2>/dev/null | head -1 || true)
if [[ -z "$TAILSCALE_IP" ]]; then
    err "Tailscale이 실행 중이지 않거나 IP를 가져올 수 없습니다."
    err "  sudo tailscale up 으로 연결 후 다시 시도하세요."
    exit 1
fi
log "Tailscale IP: $TAILSCALE_IP"

# ── 2. iptables: 포트 8070, 1355 열기 ───────────────────────
open_port() {
    local port="$1"
    # 이미 있으면 스킵
    if iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null; then
        log "iptables: :${port} 이미 열려 있음"
    else
        iptables -I INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null && \
            log "iptables: :${port} ACCEPT 추가" || \
            warn "iptables 권한 없음 — sudo 로 실행하세요: sudo iptables -I INPUT -p tcp --dport ${port} -j ACCEPT"
    fi
}

open_port 8070
open_port 1355

# ufw가 설치돼 있으면 거기도 열기
if command -v ufw &>/dev/null && ufw status 2>/dev/null | grep -q "Status: active"; then
    ufw allow 8070/tcp 2>/dev/null && log "ufw: 8070 허용" || warn "ufw 8070 설정 실패"
    ufw allow 1355/tcp 2>/dev/null && log "ufw: 1355 허용" || warn "ufw 1355 설정 실패"
fi

# ── 3. musu-bridge 재시작 (실행 중이면 skip) ────────────────
if curl -sf --max-time 2 "http://127.0.0.1:8070/health" >/dev/null 2>&1; then
    log "musu-bridge 이미 실행 중 (:8070)"
else
    log "musu-bridge 시작 중..."
    bash "$SCRIPT_DIR/start-bridge.sh" &
    sleep 3
    if curl -sf --max-time 3 "http://127.0.0.1:8070/health" >/dev/null 2>&1; then
        log "musu-bridge 시작 완료"
    else
        err "musu-bridge 시작 실패 — logs/musu-bridge.log 확인"
    fi
fi

# ── 4. Tailscale IP로 self-health 확인 ──────────────────────
log "Tailscale IP로 self-check: http://${TAILSCALE_IP}:8070/health"
if curl -sf --max-time 5 "http://${TAILSCALE_IP}:8070/health" >/dev/null 2>&1; then
    log "✅ 외부 접속 가능 확인됨 (${TAILSCALE_IP}:8070)"
else
    warn "⚠️  Tailscale IP로 접속 안 됨 — 아래 명령을 sudo로 실행하세요:"
    echo ""
    echo "  sudo iptables -I INPUT -p tcp --dport 8070 -j ACCEPT"
    echo "  sudo iptables -I INPUT -p tcp --dport 1355 -j ACCEPT"
    echo ""
    warn "WSL2의 경우 Windows PowerShell에서도 필요할 수 있음:"
    echo "  netsh interface portproxy add v4tov4 listenport=8070 listenaddress=0.0.0.0 connectport=8070 connectaddress=$(hostname -I | awk '{print $1}')"
fi

# ── 5. second-pc에서 확인할 명령 출력 ───────────────────────
echo ""
log "=== second-pc에서 확인할 명령 ==="
echo "  curl http://${TAILSCALE_IP}:8070/health"
echo "  curl http://${TAILSCALE_IP}:1355/health"
echo ""
log "second-pc에서 원격 노드 연결하려면:"
echo "  bash scripts/connect-remote-node.sh ${TAILSCALE_IP}"
