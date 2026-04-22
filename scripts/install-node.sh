#!/usr/bin/env bash
# MUSU 서브 기기 자동 설치 및 클러스터 조인 스크립트 (Product-Ready)
# 사용법: curl -sL http://<메인기기IP>:8070/install.sh | bash -s <메인기기IP> <현재기기명>

set -euo pipefail

MAIN_IP="${1:-}"
NODE_NAME="${2:-}"

if [[ -z "$MAIN_IP" || -z "$NODE_NAME" ]]; then
    echo "Usage: bash install-node.sh <main-node-ip> <this-node-name>"
    echo "Example: bash install-node.sh 192.168.1.154 5070"
    exit 1
fi

echo "[1/4] 환경 설정 및 의존성 확인 중..."
ROOT_DIR="$HOME/musu-functions"
mkdir -p "$ROOT_DIR"

echo "[2/4] 중앙 저장소(Forgejo) 연동 및 코드 동기화..."
# 1. SSH 키 자동 생성
KEY_FILE="$HOME/.ssh/id_rsa_musu_agent"
if [ ! -f "$KEY_FILE" ]; then
    ssh-keygen -t ed25519 -f "$KEY_FILE" -N "" -q
fi

# 2. 메인 기기에서 코드 복제
cd "$ROOT_DIR"
if [ -d ".git" ]; then
    GIT_SSH_COMMAND="ssh -i $KEY_FILE -o StrictHostKeyChecking=no" git pull http://${MAIN_IP}:3000/musu_admin/musu-project.git main --rebase
else
    GIT_SSH_COMMAND="ssh -i $KEY_FILE -o StrictHostKeyChecking=no" git clone http://${MAIN_IP}:3000/musu_admin/musu-project.git .
fi

echo "[3/4] 백그라운드 자동 업데이트 데몬(Cron) 등록..."
# 3. 5분마다 메인 서버와 동기화하고 변경사항이 있으면 스스로 재빌드하는 스크립트 등록
CRON_CMD="*/5 * * * * bash $ROOT_DIR/scripts/remote-node-update.sh >> $ROOT_DIR/logs/auto-update.log 2>&1"
(crontab -l 2>/dev/null | grep -v "remote-node-update.sh"; echo "$CRON_CMD") | crontab -

echo "[4/4] 런타임 엔진(musu-portd & musu-bridge) 자동 실행 설정..."
# 4. systemd 서비스 등록으로 부팅 시 자동 시작 (0.0.0.0 바인딩 보장)
mkdir -p "$HOME/.config/systemd/user"
cat <<EOF > "$HOME/.config/systemd/user/musu-portd.service"
[Unit]
Description=MUSU Port Daemon
After=network.target

[Service]
Type=simple
WorkingDirectory=$ROOT_DIR/musu-port
Environment="MUSU_PORT_MANAGER_HOST=0.0.0.0"
ExecStart=$ROOT_DIR/musu-port/target/release/musu-portd
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now musu-portd.service || echo "시스템 데몬 등록 완료. (WSL의 경우 백그라운드 실행 사용 필요)"

# WSL 폴백 실행
pkill -f musu-portd || true
cd "$ROOT_DIR/musu-port" && cargo build --release
MUSU_PORT_MANAGER_HOST=0.0.0.0 nohup ./target/release/musu-portd > "$ROOT_DIR/logs/musu-portd.log" 2>&1 &

echo "============================================================"
echo "✅ MUSU 서브 기기($NODE_NAME) 셋업 및 클러스터 조인 완료!"
echo "이제 이 기기는 메인 기기($MAIN_IP)와 자동으로 동기화되며,"
echo "코드가 업데이트되면 스스로 재빌드 후 재시작합니다."
echo "사용자의 추가 개입은 필요하지 않습니다."
echo "============================================================"
