#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UNIT_SRC="${ROOT_DIR}/scripts/systemd/musu-worker.service"
ENV_EXAMPLE="${ROOT_DIR}/scripts/systemd/worker.env.example"

if ! command -v systemctl >/dev/null 2>&1; then
  echo "systemctl not found. Install systemd or use scripts/start-worker.sh directly."
  exit 1
fi

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  cat <<'EOF'
Install MUSU Worker as a systemd user service (no sudo).

Creates:
  ~/.config/systemd/user/musu-worker.service
  ~/.musu/worker.env  (from template if missing)

Then runs:
  systemctl --user enable --now musu-worker.service

EOF
  exit 0
fi

mkdir -p "${HOME}/.config/systemd/user"
mkdir -p "${HOME}/.musu"

cp -f "${UNIT_SRC}" "${HOME}/.config/systemd/user/musu-worker.service"

if [[ ! -f "${HOME}/.musu/worker.env" ]]; then
  cp -f "${ENV_EXAMPLE}" "${HOME}/.musu/worker.env"
  echo "Created ${HOME}/.musu/worker.env (edit as needed; add token before remote exposure)."
fi

systemctl --user daemon-reload
systemctl --user enable --now musu-worker.service

echo "Installed and started user service: musu-worker"
echo "Logs: journalctl --user -u musu-worker -f"
echo "Health (local): curl -sf http://127.0.0.1:9700/health"
