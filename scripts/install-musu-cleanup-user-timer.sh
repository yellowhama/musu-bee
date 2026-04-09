#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_SRC="${ROOT_DIR}/scripts/systemd/musu-cleanup.service"
TIMER_SRC="${ROOT_DIR}/scripts/systemd/musu-cleanup.timer"
ENV_EXAMPLE="${ROOT_DIR}/scripts/systemd/cleanup.env.example"

if ! command -v systemctl >/dev/null 2>&1; then
  echo "systemctl not found. Install systemd or run scripts/musu_cleanup.py manually."
  exit 1
fi

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  cat <<'EOF'
Install MUSU cleanup as a systemd user timer (no sudo).

Installs:
  ~/.config/systemd/user/musu-cleanup.service
  ~/.config/systemd/user/musu-cleanup.timer

Then enables timer:
  systemctl --user enable --now musu-cleanup.timer

EOF
  exit 0
fi

mkdir -p "${HOME}/.config/systemd/user"
mkdir -p "${HOME}/.musu"
cp -f "${SERVICE_SRC}" "${HOME}/.config/systemd/user/musu-cleanup.service"
cp -f "${TIMER_SRC}" "${HOME}/.config/systemd/user/musu-cleanup.timer"

if [[ ! -f "${HOME}/.musu/cleanup.env" ]]; then
  cp -f "${ENV_EXAMPLE}" "${HOME}/.musu/cleanup.env"
  echo "Created ${HOME}/.musu/cleanup.env (edit TTL/size caps as needed)."
fi

systemctl --user daemon-reload
systemctl --user enable --now musu-cleanup.timer

echo "Installed and enabled user timer: musu-cleanup"
echo "Run now: systemctl --user start musu-cleanup.service"
echo "Logs: journalctl --user -u musu-cleanup.service -n 200 --no-pager"
