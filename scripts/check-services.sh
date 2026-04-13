#!/usr/bin/env bash
# MUSU 서비스 상태 확인
# 사용: bash scripts/check-services.sh
set -uo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

check() {
  local name="$1" url="$2"
  if curl -sf --max-time 2 "$url" >/dev/null 2>&1; then
    echo -e "  ${GREEN}●${NC} ${name}"
  else
    echo -e "  ${RED}●${NC} ${name} (down)"
  fi
}

echo "MUSU Service Status"
echo "───────────────────"
check "musu-bee    :3001" "http://127.0.0.1:3001"
check "musu-port   :1355" "http://127.0.0.1:1355/health"
check "musu-bridge :8070" "http://127.0.0.1:8070/health"
check "musu-worker :9700" "http://127.0.0.1:9700/health"
check "Paperclip   :3100" "http://127.0.0.1:3100/health"
echo "───────────────────"
