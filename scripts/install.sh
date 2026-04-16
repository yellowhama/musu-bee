#!/usr/bin/env bash
set -euo pipefail

# musu-bridge installer
# Usage: bash <(curl -fsSL https://musu.pro/install.sh)

INSTALL_DIR="${MUSU_INSTALL_DIR:-${HOME}/.musu/bridge}"
REPO="${MUSU_REPO:-https://github.com/yellowhama/musu-bee.git}"

# Dependency check
for cmd in git curl python3; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "[ERROR] '$cmd' is required but not found. Please install it and retry."
    exit 1
  fi
done

# Clone or update
if [[ -d "${INSTALL_DIR}/.git" ]]; then
  echo "==> Updating musu-bridge..."
  git -C "$INSTALL_DIR" pull --ff-only --quiet
else
  echo "==> Installing musu-bridge → ${INSTALL_DIR}"
  git clone --depth=1 "$REPO" "$INSTALL_DIR" --quiet
fi

# Python venv (first time only)
VENV="${INSTALL_DIR}/musu-bridge/.venv"
REQ="${INSTALL_DIR}/musu-bridge/requirements.txt"
if [[ ! -x "${VENV}/bin/python3" ]]; then
  echo "==> Setting up Python environment..."
  python3 -m venv "$VENV"
  if [[ -f "$REQ" ]]; then
    "${VENV}/bin/pip" install -r "$REQ" -q
  fi
fi

echo "==> Starting musu-bridge..."
exec bash "${INSTALL_DIR}/scripts/start-bridge.sh" "$@"
