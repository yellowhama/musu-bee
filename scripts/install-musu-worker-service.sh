#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

SERVICE_NAME="${MUSU_WORKER_SERVICE_NAME:-musu-worker}"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

USER_NAME="${MUSU_WORKER_USER:-$(whoami)}"
HOME_DIR="$(eval echo "~${USER_NAME}")"

HOST="${MUSU_WORKER_HOST:-0.0.0.0}"
PORT="${MUSU_WORKER_PORT:-9700}"
TOKEN_FILE="${MUSU_WORKER_TOKEN_FILE:-${HOME_DIR}/.musu/worker_token}"

if ! command -v systemctl >/dev/null 2>&1; then
  echo "systemctl not found; cannot install systemd service" >&2
  exit 1
fi

echo "Installing systemd unit: ${SERVICE_FILE}"
TMP="$(mktemp)"
{
  printf '%s\n' '[Unit]'
  printf '%s\n' 'Description=MUSU worker (remote exec)'
  printf '%s\n' 'After=network-online.target tailscaled.service'
  printf '%s\n' 'Wants=network-online.target tailscaled.service'
  printf '\n'
  printf '%s\n' '[Service]'
  printf '%s\n' 'Type=simple'
  printf '%s\n' "User=${USER_NAME}"
  printf '%s\n' "WorkingDirectory=${ROOT_DIR}"
  printf '%s\n' "Environment=MUSU_WORKER_HOST=${HOST}"
  printf '%s\n' "Environment=MUSU_WORKER_PORT=${PORT}"
  printf '%s\n' "Environment=MUSU_WORKER_TOKEN_FILE=${TOKEN_FILE}"
  printf '%s\n' "ExecStart=${ROOT_DIR}/scripts/start-worker.sh"
  printf '%s\n' 'Restart=on-failure'
  printf '%s\n' 'RestartSec=1'
  printf '\n'
  printf '%s\n' '[Install]'
  printf '%s\n' 'WantedBy=multi-user.target'
} >"${TMP}"

sudo mv "${TMP}" "${SERVICE_FILE}"
sudo chmod 0644 "${SERVICE_FILE}"
sudo systemctl daemon-reload

echo "Enabling + starting: ${SERVICE_NAME}.service"
sudo systemctl enable --now "${SERVICE_NAME}.service"

echo "--- status (top) ---"
sudo systemctl status --no-pager "${SERVICE_NAME}.service" | head -n 20 || true

echo "--- health (loopback) ---"
curl -sS --max-time 3 -w "\nHTTP %{http_code}\n" "http://127.0.0.1:${PORT}/health" || true

echo "--- health (tailscale) ---"
SELF_IP="$(tailscale ip -4 | head -n 1 || true)"
if [[ -n "${SELF_IP}" ]]; then
  curl -sS --max-time 3 -w "\nHTTP %{http_code}\n" "http://${SELF_IP}:${PORT}/health" || true
fi
