#!/usr/bin/env bash
# MUSU 원클릭 설치 스크립트
# 사용법: bash install.sh [--dev] [--docker]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
DEV_MODE=""
DOCKER_MODE=""
for arg in "$@"; do
    case "$arg" in
        --dev)    DEV_MODE=1 ;;
        --docker) DOCKER_MODE=1 ;;
    esac
done

# ── 색상 ──────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${GREEN}[MUSU]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

# ── OS 감지 ────────────────────────────────────────────────────
OS="linux"
if [[ "$(uname -s)" == "Darwin" ]]; then
    OS="macos"
fi
info "OS: $OS"

# ── Docker 모드 ────────────────────────────────────────────────
if [[ -n "$DOCKER_MODE" ]]; then
    info "Docker 모드로 설치 중..."

    if ! command -v docker &>/dev/null; then
        error "Docker가 설치되어 있지 않습니다. https://docs.docker.com/get-docker/"
    fi
    if ! command -v docker compose &>/dev/null && ! command -v docker-compose &>/dev/null; then
        error "docker compose 플러그인이 필요합니다."
    fi

    # docker-compose.yml 생성
    COMPOSE_FILE="$ROOT/docker-compose.yml"
    if [[ ! -f "$COMPOSE_FILE" ]]; then
        info "docker-compose.yml 생성 중..."
        cat > "$COMPOSE_FILE" <<'COMPOSE'
version: "3.9"

services:
  musu-bridge:
    build:
      context: ./musu-bridge
      dockerfile: Dockerfile
    ports:
      - "8070:8070"
    env_file:
      - ./musu-bridge/.env
    volumes:
      - musu-data:/data
    restart: unless-stopped

  musu-worker:
    build:
      context: ./musu-worker
      dockerfile: Dockerfile
    ports:
      - "9700:9700"
    env_file:
      - ./musu-worker/.env
    restart: unless-stopped

  musu-bee:
    build:
      context: ./musu-bee
      dockerfile: Dockerfile
    ports:
      - "3001:3001"
    env_file:
      - ./musu-bee/.env.local
    depends_on:
      - musu-bridge
    restart: unless-stopped

volumes:
  musu-data:
COMPOSE
        info "docker-compose.yml 생성 ✓"
    else
        info "docker-compose.yml 이미 존재 — 건너뜀"
    fi

    # 각 서비스 Dockerfile이 없으면 기본 생성
    for svc in musu-bridge musu-worker; do
        DF="$ROOT/$svc/Dockerfile"
        if [[ ! -f "$DF" ]]; then
            cat > "$DF" <<DFILE
FROM python:3.12-slim
WORKDIR /app
COPY . .
RUN pip install --no-cache-dir -e .
EXPOSE $([ "$svc" = "musu-bridge" ] && echo 8070 || echo 9700)
CMD ["python", "-m", "uvicorn", "$(basename $svc | tr '-' '_').main:app", "--host", "0.0.0.0", "--port", "$([ "$svc" = "musu-bridge" ] && echo 8070 || echo 9700)"]
DFILE
            info "$svc/Dockerfile 생성 ✓"
        fi
    done

    BEE_DF="$ROOT/musu-bee/Dockerfile"
    if [[ ! -f "$BEE_DF" ]]; then
        cat > "$BEE_DF" <<'DFILE'
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --silent
COPY . .
RUN npm run build

FROM node:20-slim
WORKDIR /app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3001
ENV PORT=3001
CMD ["node", "server.js"]
DFILE
        info "musu-bee/Dockerfile 생성 ✓"
    fi

    echo ""
    echo -e "${GREEN}══════════════════════════════════════${NC}"
    echo -e "${GREEN}  Docker 설정 완료!${NC}"
    echo -e "${GREEN}══════════════════════════════════════${NC}"
    echo ""
    echo "다음 단계:"
    echo "  1. 환경변수 설정:"
    echo "     cp musu-bridge/.env.example musu-bridge/.env  # 편집 후"
    echo ""
    echo "  2. 스택 시작:"
    echo "     docker compose up -d"
    echo ""
    echo "  3. 서비스 URL:"
    echo "     musu-bridge : http://localhost:8070"
    echo "     musu-bee    : http://localhost:3001"
    echo "     musu-worker : http://localhost:9700"
    echo ""
    exit 0
fi

# ── 1. Python 버전 확인 ────────────────────────────────────────
info "Python 버전 확인 중..."
PY=$(command -v python3 2>/dev/null || command -v python 2>/dev/null || true)
if [[ -z "$PY" ]]; then
    if [[ "$OS" == "macos" ]]; then
        if command -v brew &>/dev/null; then
            info "Homebrew로 Python 설치 중..."
            brew install python@3.12
            PY=$(command -v python3)
        else
            error "Python3 및 Homebrew가 없습니다. https://brew.sh 에서 Homebrew를 먼저 설치하세요."
        fi
    else
        error "Python3를 찾을 수 없습니다. 'sudo apt install python3' 로 설치하세요."
    fi
fi
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
        if [[ "$OS" == "macos" ]] && command -v brew &>/dev/null; then
            info "Homebrew로 Node.js 설치 중..."
            brew install node
            (cd "$ROOT/musu-bee" && npm install --silent)
        else
            warn "pnpm/npm 없음 — musu-bee 의존성 수동 설치 필요"
        fi
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
    AUTO_BRIDGE_TOKEN="$(date +%s | sha256sum 2>/dev/null | head -c 64 || date +%s | shasum | head -c 64)"
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
    # MUSU_BRIDGE_TOKEN 자동 삽입 (macOS: sed -i '' / Linux: sed -i)
    if [[ "$OS" == "macos" ]]; then
        sed -i '' "s|^MUSU_BRIDGE_TOKEN=.*|MUSU_BRIDGE_TOKEN=$AUTO_BRIDGE_TOKEN|" "$ROOT/musu-bee/.env.local" 2>/dev/null || true
    else
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
if [[ "$OS" == "macos" ]]; then
    echo "  macOS 팁:"
    echo "     launchctl 서비스 등록: scripts/install-musu-bridge-service.sh"
    echo ""
fi
