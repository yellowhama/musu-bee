#!/usr/bin/env bash
# musu-functions fresh machine bootstrap
# Installs system dependencies, then runs scripts/install.sh.
#
# Usage (on a brand-new Ubuntu / WSL2 machine):
#   bash scripts/bootstrap.sh [--service] [--start]
#
# What it does:
#   1. Installs Python 3.12, Node.js 22, pnpm (if missing)
#   2. Runs scripts/install.sh (venv, bridge.env, musu-bee build)
#
# Flags are passed through to install.sh:
#   --service  register systemd user services
#   --start    start bridge immediately after install
#
# Supported platforms: Ubuntu 22.04+ / WSL2 / macOS (via Homebrew)
# Idempotent: already-installed components are skipped.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo -e "${GREEN}[bootstrap]${NC} ✓ $*"; }
warn() { echo -e "${YELLOW}[bootstrap]${NC} ⚠ $*"; }
err()  { echo -e "${RED}[bootstrap]${NC} ✗ $*" >&2; exit 1; }
info() { echo -e "[bootstrap] $*"; }

OS="linux"
[[ "$(uname -s)" == "Darwin" ]] && OS="macos"

echo ""
echo "[bootstrap] === musu-functions fresh machine bootstrap ==="
echo "[bootstrap]     OS: ${OS}"
echo ""

# ── 1. Python 3.10+ ───────────────────────────────────────────────────────────
info "Step 1: Python 3.10+"
if command -v python3 &>/dev/null; then
    PY_MINOR=$(python3 -c "import sys; print(sys.version_info.minor)")
    PY_MAJOR=$(python3 -c "import sys; print(sys.version_info.major)")
    if [[ "$PY_MAJOR" -ge 3 && "$PY_MINOR" -ge 10 ]]; then
        ok "python3 $(python3 --version | cut -d' ' -f2) already installed"
    else
        warn "python3 version too old — attempting upgrade"
        if [[ "$OS" == "linux" ]]; then
            sudo apt-get update -qq
            sudo apt-get install -y python3.12 python3.12-venv python3-pip
        else
            err "Upgrade Python manually to 3.10+ and re-run."
        fi
    fi
else
    info "  python3 not found — installing..."
    if [[ "$OS" == "linux" ]]; then
        sudo apt-get update -qq
        sudo apt-get install -y python3.12 python3.12-venv python3-pip
        ok "python3.12 installed"
    elif [[ "$OS" == "macos" ]]; then
        if ! command -v brew &>/dev/null; then
            err "Homebrew not found. Install it first: https://brew.sh"
        fi
        brew install python@3.12
        ok "python3.12 installed via Homebrew"
    fi
fi

# Ensure python3-venv is available (Ubuntu separates it)
if [[ "$OS" == "linux" ]] && ! python3 -m venv --help &>/dev/null 2>&1; then
    info "  python3-venv not found — installing..."
    sudo apt-get install -y python3-venv python3-pip
    ok "python3-venv installed"
fi

# ── 2. Node.js 18+ ────────────────────────────────────────────────────────────
info "Step 2: Node.js 18+"
if command -v node &>/dev/null; then
    NODE_MAJOR=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [[ "$NODE_MAJOR" -ge 18 ]]; then
        ok "node $(node --version) already installed"
    else
        warn "Node.js $(node --version) too old — need 18+"
        if [[ "$OS" == "linux" ]]; then
            info "  Installing Node.js 22 via NodeSource..."
            curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - >/dev/null 2>&1
            sudo apt-get install -y nodejs >/dev/null 2>&1
            ok "node $(node --version) installed"
        else
            err "Upgrade Node.js manually to 18+ and re-run."
        fi
    fi
else
    info "  node not found — installing..."
    if [[ "$OS" == "linux" ]]; then
        curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - >/dev/null 2>&1
        sudo apt-get install -y nodejs >/dev/null 2>&1
        ok "node $(node --version) installed"
    elif [[ "$OS" == "macos" ]]; then
        brew install node
        ok "node installed via Homebrew"
    fi
fi

# ── 3. pnpm ───────────────────────────────────────────────────────────────────
info "Step 3: pnpm"
if command -v pnpm &>/dev/null; then
    ok "pnpm $(pnpm --version) already installed"
else
    info "  pnpm not found — installing via npm..."
    npm install -g pnpm --silent
    ok "pnpm $(pnpm --version) installed"
fi

# ── 4. git ────────────────────────────────────────────────────────────────────
info "Step 4: git"
if command -v git &>/dev/null; then
    ok "git $(git --version | cut -d' ' -f3) found"
else
    if [[ "$OS" == "linux" ]]; then
        sudo apt-get install -y git >/dev/null 2>&1
        ok "git installed"
    else
        err "git not found. Install Xcode command line tools: xcode-select --install"
    fi
fi

# ── 5. curl + jq (needed by start-bridge.sh device auth) ─────────────────────
info "Step 5: curl + jq"
MISSING_PKGS=()
command -v curl &>/dev/null || MISSING_PKGS+=("curl")
command -v jq   &>/dev/null || MISSING_PKGS+=("jq")
if [[ "${#MISSING_PKGS[@]}" -gt 0 ]]; then
    if [[ "$OS" == "linux" ]]; then
        sudo apt-get install -y "${MISSING_PKGS[@]}" >/dev/null 2>&1
        ok "${MISSING_PKGS[*]} installed"
    elif [[ "$OS" == "macos" ]]; then
        brew install "${MISSING_PKGS[@]}"
        ok "${MISSING_PKGS[*]} installed via Homebrew"
    fi
else
    ok "curl + jq already present"
fi

# ── 6. Run main install.sh ────────────────────────────────────────────────────
echo ""
info "Step 6: running scripts/install.sh..."
echo ""
bash "${SCRIPT_DIR}/install.sh" "$@"

echo ""
ok "=== bootstrap complete ==="
echo ""
echo "  Fresh install done. Next:"
echo "    bash scripts/start-bridge.sh     # start bridge (device auth on first run)"
echo "    bash scripts/dev-start.sh        # start all services for dev"
echo ""
