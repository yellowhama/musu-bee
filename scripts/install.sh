#!/usr/bin/env bash
# musu-bridge 설치 스크립트
# 새 기기에서 git clone 직후 한 번 실행 → 브리지 실행 가능 상태로 만듦
#
# 사용법:
#   bash scripts/install.sh              # 설정만 (venv, ~/.musu, bridge.env)
#   bash scripts/install.sh --service    # + systemd 서비스 등록
#   bash scripts/install.sh --start      # + 즉시 브리지 시작
#   bash scripts/install.sh --service --start
#
# 멱등성: 이미 설치돼 있으면 스킵. 재실행 안전.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
MUSU_HOME="${HOME}/.musu"
VENV="${ROOT}/musu-bridge/.venv"

# ── 플래그 파싱 ──────────────────────────────────────────────
INSTALL_SERVICE=0
START_BRIDGE=0
for arg in "$@"; do
    case "$arg" in
        --service) INSTALL_SERVICE=1 ;;
        --start)   START_BRIDGE=1 ;;
    esac
done

# ── 색상 출력 ────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo -e "${GREEN}[install]${NC} ✓ $*"; }
warn() { echo -e "${YELLOW}[install]${NC} ⚠ $*"; }
err()  { echo -e "${RED}[install]${NC} ✗ $*" >&2; exit 1; }
info() { echo -e "[install] $*"; }

echo ""
echo "[install] === musu-bridge 설치 시작 ==="
echo "[install]     repo: ${ROOT}"
echo "[install]     musu: ${MUSU_HOME}"
echo ""

# ── Step 1: Python3 확인 ──────────────────────────────────────
if ! command -v python3 &>/dev/null; then
    err "python3가 없습니다. 설치: sudo apt install python3 python3-venv python3-pip"
fi
PY_VERSION=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
info "Step 1: Python ${PY_VERSION} 확인됨"

# ── Step 2: ~/.musu/ 생성 ────────────────────────────────────
if [[ ! -d "${MUSU_HOME}" ]]; then
    mkdir -p "${MUSU_HOME}"
    chmod 700 "${MUSU_HOME}"
    ok "~/.musu/ 생성됨"
else
    info "Step 2: ~/.musu/ 이미 존재"
fi
mkdir -p "${MUSU_HOME}/db"

# ── Step 3: venv 생성 + deps 설치 ────────────────────────────
if [[ ! -x "${VENV}/bin/python3" ]]; then
    info "Step 3: venv 생성 중..."
    python3 -m venv "${VENV}"
    ok "venv 생성: ${VENV}"

    info "       musu-core 설치 중..."
    "${VENV}/bin/pip" install --quiet -e "${ROOT}/musu-core/"
    ok "musu-core 설치됨"

    info "       musu-bridge 설치 중..."
    "${VENV}/bin/pip" install --quiet -e "${ROOT}/musu-bridge/"
    ok "musu-bridge 설치됨"
else
    info "Step 3: venv 이미 존재 — deps 스킵"
fi

# ── Step 4: ~/.musu/bridge.env 시딩 ──────────────────────────
BRIDGE_ENV="${MUSU_HOME}/bridge.env"
ENV_EXAMPLE="${SCRIPT_DIR}/systemd/bridge.env.example"

if [[ ! -f "${BRIDGE_ENV}" ]]; then
    info "Step 4: bridge.env 생성 중..."
    cp "${ENV_EXAMPLE}" "${BRIDGE_ENV}"
    chmod 600 "${BRIDGE_ENV}"

    # MUSU_BRIDGE_TOKEN 자동 생성
    TOKEN="$(openssl rand -hex 32 2>/dev/null || python3 -c "import secrets; print(secrets.token_hex(32))")"
    sed -i "s|^MUSU_BRIDGE_TOKEN=.*|MUSU_BRIDGE_TOKEN=${TOKEN}|" "${BRIDGE_ENV}"

    # BRIDGE_HOST=0.0.0.0 추가 (원격 접속 가능하게)
    printf '\n# 원격 접속용 바인딩 (install.sh 자동 추가)\nBRIDGE_HOST=0.0.0.0\n' >> "${BRIDGE_ENV}"

    ok "bridge.env 생성됨 (토큰 자동 발급)"
    warn "musu.pro 연동 원하면 MUSU_TOKEN을 ${BRIDGE_ENV}에 설정하세요"
else
    info "Step 4: bridge.env 이미 존재 — 스킵"
    # 토큰이 비어있으면 채우기
    if grep -q "^MUSU_BRIDGE_TOKEN=$" "${BRIDGE_ENV}" 2>/dev/null; then
        TOKEN="$(openssl rand -hex 32 2>/dev/null || python3 -c "import secrets; print(secrets.token_hex(32))")"
        sed -i "s|^MUSU_BRIDGE_TOKEN=.*|MUSU_BRIDGE_TOKEN=${TOKEN}|" "${BRIDGE_ENV}"
        ok "MUSU_BRIDGE_TOKEN 자동 발급됨"
    fi
fi

# ── Step 5: ~/.musu/nodes.toml 초기화 ────────────────────────
NODES_TOML="${MUSU_HOME}/nodes.toml"
if [[ ! -f "${NODES_TOML}" ]]; then
    NODE_NAME="$(hostname)"
    printf '[mesh]\nself = "%s"\n' "${NODE_NAME}" > "${NODES_TOML}"
    ok "nodes.toml 초기화됨 (self=${NODE_NAME})"
else
    info "Step 5: nodes.toml 이미 존재 — 스킵"
fi

# ── Step 6: systemd 서비스 등록 (--service) ──────────────────
if [[ "${INSTALL_SERVICE}" == "1" ]]; then
    info "Step 6: systemd 서비스 등록 중..."
    bash "${SCRIPT_DIR}/install-musu-bridge-service.sh"
    ok "systemd 서비스 등록됨"
else
    info "Step 6: systemd 등록 스킵 (--service 플래그 없음)"
fi

# ── 완료 메시지 ───────────────────────────────────────────────
echo ""
ok "=== 설치 완료 ==="
echo ""
echo "  config:  ${BRIDGE_ENV}"
TOKEN_PREVIEW="$(grep '^MUSU_BRIDGE_TOKEN=' "${BRIDGE_ENV}" | cut -d= -f2 | cut -c1-16)"
echo "  token:   ${TOKEN_PREVIEW}..."
echo ""

if [[ "${START_BRIDGE}" == "0" ]]; then
    echo "  브리지 시작:"
    echo "    bash ${SCRIPT_DIR}/start-bridge.sh"
    [[ "${INSTALL_SERVICE}" == "1" ]] && echo "    또는: systemctl --user start musu-bridge"
    echo ""
fi

# ── Step 7: 브리지 즉시 시작 (--start) ────────────────────────
if [[ "${START_BRIDGE}" == "1" ]]; then
    echo ""
    info "Step 7: 브리지 시작 중..."

    if [[ "${INSTALL_SERVICE}" == "1" ]]; then
        systemctl --user start musu-bridge
        sleep 3
    else
        mkdir -p "${ROOT}/logs"
        nohup bash "${SCRIPT_DIR}/start-bridge.sh" \
            > "${ROOT}/logs/bridge-install-start.log" 2>&1 &
        BRIDGE_PID=$!
        info "  PID: ${BRIDGE_PID}"
        sleep 4
    fi

    BRIDGE_PORT="${BRIDGE_PORT:-8070}"
    if curl -sf --max-time 5 "http://127.0.0.1:${BRIDGE_PORT}/health" >/dev/null 2>&1; then
        ok "브리지 실행 중 ✓"
        curl -s "http://127.0.0.1:${BRIDGE_PORT}/health"
        echo ""
    else
        warn "health check 실패. 로그:"
        echo "  tail -50 ${ROOT}/logs/bridge-install-start.log"
        [[ "${INSTALL_SERVICE}" == "1" ]] && echo "  journalctl --user -u musu-bridge -n 30"
        exit 1
    fi
fi
