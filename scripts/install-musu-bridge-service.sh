#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MUSU_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVICE_NAME="musu-bridge"
SERVICE_FILE="$SCRIPT_DIR/systemd/musu-bridge.service"
SYSTEMD_USER_DIR="$HOME/.config/systemd/user"
MUSU_DIR="$HOME/.musu"

echo "=== Installing $SERVICE_NAME systemd user service ==="

# 필수 파일 확인
if [[ ! -f "$SERVICE_FILE" ]]; then
    echo "ERROR: $SERVICE_FILE not found" >&2
    exit 1
fi

# ~/.musu 디렉토리 생성
mkdir -p "$MUSU_DIR"

# bridge.env 초기화 (없으면 예시 파일 복사)
if [[ ! -f "$MUSU_DIR/bridge.env" ]]; then
    cp "$SCRIPT_DIR/systemd/bridge.env.example" "$MUSU_DIR/bridge.env"
    echo "Created $MUSU_DIR/bridge.env — MUSU_BRIDGE_TOKEN을 설정하세요"
fi

# systemd user 디렉토리 생성
mkdir -p "$SYSTEMD_USER_DIR"

# 서비스 파일 substitute + copy (symlink 안 함 — placeholder를 치환해야 함)
# Old behavior was symlink, which hardcoded `%h/musu-functions` (broken when
# the repo is cloned to ~/musu-bee or any other path). Now we substitute
# __MUSU_ROOT__ with the actual repo path resolved from this script's location.
sed "s|__MUSU_ROOT__|$MUSU_ROOT|g" "$SERVICE_FILE" \
    > "$SYSTEMD_USER_DIR/$SERVICE_NAME.service"

# systemd 리로드 + 활성화
systemctl --user daemon-reload
systemctl --user enable "$SERVICE_NAME"

echo "✓ $SERVICE_NAME 서비스 설치 완료"
echo "  시작: systemctl --user start $SERVICE_NAME"
echo "  상태: systemctl --user status $SERVICE_NAME"
echo "  로그: journalctl --user -u $SERVICE_NAME -f"
echo ""
echo "  ⚠️  시작 전 $MUSU_DIR/bridge.env 에서 MUSU_BRIDGE_TOKEN 설정 필요"
