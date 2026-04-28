#!/usr/bin/env bash
# MUSU One-Line Installer
# Usage: curl -fsSL https://musu.pro/install | bash
#    or: curl -fsSL https://raw.githubusercontent.com/yellowhama/musu-bee/main/setup.sh | bash
set -euo pipefail

echo ""
echo "  =========================================="
echo "   MUSU Agent Runtime Installer"
echo "   AI agent teams on your own machine."
echo "  =========================================="
echo ""

# Check prerequisites
if ! command -v python3 >/dev/null 2>&1; then
    echo "  Python 3 is required but not found."
    echo "  Install: sudo apt install python3 python3-venv"
    echo "     (macOS: brew install python3)"
    exit 1
fi

if ! command -v git >/dev/null 2>&1; then
    echo "  Git is required but not found."
    echo "  Install: sudo apt install git"
    echo "     (macOS: brew install git)"
    exit 1
fi

MUSU_ROOT="${MUSU_ROOT:-$HOME/musu-functions}"

if [ -d "$MUSU_ROOT" ]; then
    echo "  Updating existing MUSU at $MUSU_ROOT..."
    cd "$MUSU_ROOT" && git pull --quiet
else
    echo "  Cloning MUSU to $MUSU_ROOT..."
    git clone --depth 1 https://github.com/yellowhama/musu-bee.git "$MUSU_ROOT"
fi

cd "$MUSU_ROOT"
echo ""
exec bash install.sh "$@"
