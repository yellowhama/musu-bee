#!/usr/bin/env bash
# MUSU 원클릭 설치 스크립트
# 사용법: bash install.sh [--dev]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
DEV_MODE="${1:-}"

# ── 색상 ──────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${GREEN}[MUSU]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

# ── 1. Python 버전 확인 ────────────────────────────────────────
info "Python 버전 확인 중..."
PY=$(command -v python3 || command -v python || error "Python3 not found")
PY_VER=$("$PY" -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
PY_MAJOR=$("$PY" -c "import sys; print(sys.version_info.major)")
PY_MINOR=$("$PY" -c "import sys; print(sys.version_info.minor)")
if [[ "$PY_MAJOR" -lt 3 || ("$PY_MAJOR" -eq 3 && "$PY_MINOR" -lt 10) ]]; then
    error "Python 3.10+ 필요 (현재: $PY_VER)"
fi
info "Python $PY_VER ✓"

# ── 2. venv 생성 ──────────────────────────────────────────────
VENV="$ROOT/.venv"
if [[ ! -d "$VENV" ]]; then
    info ".venv 생성 중..."
    "$PY" -m venv "$VENV"
fi
PIP="$VENV/bin/pip"
info ".venv ✓"

# ── 3. Python 패키지 설치 ─────────────────────────────────────
info "Python 패키지 설치 중..."
"$PIP" install --quiet --upgrade pip
"$PIP" install --quiet -e "$ROOT/musu-core"
"$PIP" install --quiet -e "$ROOT/musu-bridge"
"$PIP" install --quiet -e "$ROOT/musu-worker"
"$PIP" install --quiet -e "$ROOT/musu-control"
# musu-indexer는 선택사항
if [[ -d "$ROOT/musu-indexer" ]]; then
    "$PIP" install --quiet -e "$ROOT/musu-indexer" 2>/dev/null || warn "musu-indexer 설치 건너뜀"
fi
info "Python 패키지 ✓"

# ── 4. musu-bee Node.js 의존성 ────────────────────────────────
if [[ -d "$ROOT/musu-bee" ]]; then
    info "musu-bee 의존성 설치 중..."
    if command -v pnpm &>/dev/null; then
        (cd "$ROOT/musu-bee" && pnpm install --silent)
    elif command -v npm &>/dev/null; then
        (cd "$ROOT/musu-bee" && npm install --silent)
    else
        warn "pnpm/npm 없음 — musu-bee 의존성 수동 설치 필요"
    fi
    info "musu-bee ✓"
fi

# ── 5. ~/.musu 디렉토리 초기화 ────────────────────────────────
MUSU_DIR="$HOME/.musu"
mkdir -p "$MUSU_DIR"
if [[ ! -f "$MUSU_DIR/nodes.toml" ]]; then
    cat > "$MUSU_DIR/nodes.toml" <<'TOML'
# musu nodes registry
# 추가: [nodes.my-node] url = "http://IP:8070"
TOML
    info "~/.musu/nodes.toml 생성 ✓"
fi

# ── 6. 토큰 자동생성 + .env.local ─────────────────────────────
if command -v openssl &>/dev/null; then
    AUTO_BRIDGE_TOKEN="$(openssl rand -hex 32)"
else
    AUTO_BRIDGE_TOKEN="$(date +%s%N | sha256sum | head -c 64)"
fi

# bridge_token 파일 (start-bridge.sh가 자동으로 읽음)
if [[ ! -f "$MUSU_DIR/bridge_token" ]]; then
    echo "$AUTO_BRIDGE_TOKEN" > "$MUSU_DIR/bridge_token"
    chmod 600 "$MUSU_DIR/bridge_token"
    info "~/.musu/bridge_token 생성 ✓"
fi

# musu-bee .env.local 초기화
if [[ -f "$ROOT/musu-bee/.env.local.example" && ! -f "$ROOT/musu-bee/.env.local" ]]; then
    cp "$ROOT/musu-bee/.env.local.example" "$ROOT/musu-bee/.env.local"
    # MUSU_BRIDGE_TOKEN 자동 삽입
    if command -v sed &>/dev/null; then
        sed -i "s|^MUSU_BRIDGE_TOKEN=.*|MUSU_BRIDGE_TOKEN=$AUTO_BRIDGE_TOKEN|" "$ROOT/musu-bee/.env.local" 2>/dev/null || true
    fi
    info "musu-bee/.env.local 생성 ✓"
fi

# ── 7. 완료 메시지 ────────────────────────────────────────────
echo ""
echo -e "${GREEN}══════════════════════════════════════${NC}"
echo -e "${GREEN}  MUSU 설치 완료!${NC}"
echo -e "${GREEN}══════════════════════════════════════${NC}"
echo ""
echo "다음 단계:"
echo "  1. 개발 서버 시작:"
echo "     bash scripts/dev-start.sh"
echo ""
echo "  2. 또는 개발 모드 (토큰 자동):"
echo "     MUSU_DEV=1 bash scripts/dev-start.sh"
echo ""
echo "  3. 서비스 URL:"
echo "     musu-bridge : http://localhost:8070"
echo "     musu-bee    : http://localhost:3001"
echo "     musu-worker : http://localhost:9700"
echo ""
