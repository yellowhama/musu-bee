#!/usr/bin/env bash
# MUSU — one-line installer for Linux & macOS
# Usage:  curl -fsSL https://musu.pro/install.sh | bash
#         or:  bash install.sh
#
# What this does:
#   1. Detect OS + arch
#   2. Download pre-built binary from GitHub Releases
#   3. If unavailable, fall back to building from source (Rust)
#   4. Install to /usr/local/bin/musu or ~/.musu/bin/musu
#   5. Run `musu install` to seed initial config
#
# Requires: curl or wget, tar (only for fallback). No other deps.
set -euo pipefail

# ── Repo / release config ───────────────────────────────────────────────────
REPO="yellowhama/Musu"
RELEASE_BASE="https://github.com/${REPO}/releases/latest/download"
CLONE_URL="https://github.com/${REPO}.git"

# ── Colors ───────────────────────────────────────────────────────────────────
if [ -t 1 ]; then
    BOLD='\033[1m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    RED='\033[0;31m'
    CYAN='\033[0;36m'
    DIM='\033[2m'
    NC='\033[0m'
else
    BOLD='' GREEN='' YELLOW='' RED='' CYAN='' DIM='' NC=''
fi

info()  { printf "${CYAN}→${NC} %s\n" "$*"; }
ok()    { printf "${GREEN}✓${NC} %s\n" "$*"; }
warn()  { printf "${YELLOW}⚠${NC} %s\n" "$*"; }
err()   { printf "${RED}✗${NC} %s\n" "$*" >&2; exit 1; }

# ── Logo ─────────────────────────────────────────────────────────────────────
cat <<'LOGO'

    ╔══════════════════════════════════════╗
    ║                                      ║
    ║   ██╗   ██╗██╗   ██╗███████╗██╗   ██╗║
    ║   ███╗ ███║██║   ██║██╔════╝██║   ██║║
    ║   ██╔████╔╝██║   ██║███████╗██║   ██║║
    ║   ██║╚██╔╝ ██║   ██║╚════██║██║   ██║║
    ║   ██║ ╚═╝  ╚██████╔╝███████║╚██████╔╝║
    ║   ╚═╝      ╚═════╝ ╚══════╝ ╚═════╝ ║
    ║                                      ║
    ║     🐝  Run your own AI company.     ║
    ║                                      ║
    ╚══════════════════════════════════════╝

LOGO

# ── Detect OS ────────────────────────────────────────────────────────────────
detect_os() {
    local uname_s
    uname_s="$(uname -s)"
    case "${uname_s}" in
        Linux*)  echo "linux" ;;
        Darwin*) echo "macos" ;;
        *)       err "Unsupported OS: ${uname_s}. Use Linux or macOS." ;;
    esac
}

# ── Detect architecture ─────────────────────────────────────────────────────
detect_arch() {
    local uname_m
    uname_m="$(uname -m)"
    case "${uname_m}" in
        x86_64|amd64)   echo "x86_64" ;;
        arm64|aarch64)  echo "arm64" ;;
        *)              err "Unsupported architecture: ${uname_m}" ;;
    esac
}

# ── HTTP download helper (curl preferred, wget fallback) ─────────────────────
download() {
    local url="$1" dest="$2"
    if command -v curl &>/dev/null; then
        curl -fsSL --connect-timeout 15 --max-time 120 -o "${dest}" "${url}"
    elif command -v wget &>/dev/null; then
        wget -q --timeout=15 -O "${dest}" "${url}"
    else
        err "Neither curl nor wget found. Install one and retry."
    fi
}

# ── Check if URL exists (HEAD request) ───────────────────────────────────────
url_exists() {
    local url="$1"
    if command -v curl &>/dev/null; then
        curl -fsSL --head --connect-timeout 10 "${url}" >/dev/null 2>&1
    elif command -v wget &>/dev/null; then
        wget -q --spider --timeout=10 "${url}" 2>/dev/null
    else
        return 1
    fi
}

# ── Main ─────────────────────────────────────────────────────────────────────
OS="$(detect_os)"
ARCH="$(detect_arch)"

# Map to release asset suffix (must match release.yml matrix)
case "${OS}-${ARCH}" in
    linux-x86_64)   SUFFIX="linux-x86_64" ;;
    linux-arm64)    SUFFIX="linux-arm64" ;;
    macos-x86_64)   SUFFIX="macos-x86_64" ;;
    macos-arm64)    SUFFIX="macos-arm64" ;;
    *)              err "No pre-built binary for ${OS}-${ARCH}" ;;
esac

BINARY_NAME="musu-${SUFFIX}"
DOWNLOAD_URL="${RELEASE_BASE}/${BINARY_NAME}"

info "Detected: ${BOLD}${OS} ${ARCH}${NC}"

# ── Step 1: Try downloading pre-built binary ─────────────────────────────────
TMPDIR_INSTALL="$(mktemp -d)"
trap 'rm -rf "${TMPDIR_INSTALL}"' EXIT

DOWNLOADED=0
info "Downloading ${BINARY_NAME}..."
if download "${DOWNLOAD_URL}" "${TMPDIR_INSTALL}/musu" 2>/dev/null; then
    download "${RELEASE_BASE}/SHA256SUMS" "${TMPDIR_INSTALL}/SHA256SUMS" 2>/dev/null || true
    if [ -f "${TMPDIR_INSTALL}/SHA256SUMS" ] && grep -q "${BINARY_NAME}" "${TMPDIR_INSTALL}/SHA256SUMS"; then
        EXPECTED_SHA=$(grep "${BINARY_NAME}" "${TMPDIR_INSTALL}/SHA256SUMS" | awk '{print $1}')
        ACTUAL_SHA=""
        if command -v sha256sum &>/dev/null; then
            ACTUAL_SHA=$(sha256sum "${TMPDIR_INSTALL}/musu" | awk '{print $1}')
        elif command -v shasum &>/dev/null; then
            ACTUAL_SHA=$(shasum -a 256 "${TMPDIR_INSTALL}/musu" | awk '{print $1}')
        fi
        
        if [ -n "${ACTUAL_SHA}" ]; then
            if [ "${EXPECTED_SHA}" != "${ACTUAL_SHA}" ]; then
                err "Checksum mismatch! Expected: ${EXPECTED_SHA}, Actual: ${ACTUAL_SHA}"
            fi
            ok "Checksum verified (${ACTUAL_SHA:0:8}...)"
        fi
    fi

    chmod +x "${TMPDIR_INSTALL}/musu"
    # Sanity check: is it actually an executable?
    if file "${TMPDIR_INSTALL}/musu" 2>/dev/null | grep -qiE 'executable|Mach-O|ELF'; then
        DOWNLOADED=1
        ok "Binary downloaded successfully"
    else
        warn "Downloaded file is not a valid binary — falling back to source build"
        rm -f "${TMPDIR_INSTALL}/musu"
    fi
else
    warn "Pre-built binary not available — falling back to source build"
fi

# ── Step 2: Fallback — build from source ─────────────────────────────────────
if [ "${DOWNLOADED}" -eq 0 ]; then
    info "Building from source (this may take a few minutes)..."

    # Check / install Rust
    if ! command -v cargo &>/dev/null; then
        if command -v rustup &>/dev/null; then
            info "rustup found but cargo not in PATH — running rustup default stable..."
            rustup default stable
        else
            info "Installing Rust via rustup..."
            download "https://sh.rustup.rs" "${TMPDIR_INSTALL}/rustup-init.sh"
            chmod +x "${TMPDIR_INSTALL}/rustup-init.sh"
            "${TMPDIR_INSTALL}/rustup-init.sh" -y --default-toolchain stable --profile minimal
            # Source cargo env for this session
            # shellcheck source=/dev/null
            . "${HOME}/.cargo/env" 2>/dev/null || true
        fi
    fi

    if ! command -v cargo &>/dev/null; then
        err "cargo still not found after rustup install. Add ~/.cargo/bin to PATH and retry."
    fi
    ok "Rust toolchain ready ($(rustc --version))"

    # Clone and build
    CLONE_DIR="${TMPDIR_INSTALL}/Musu"
    info "Cloning ${CLONE_URL}..."
    LATEST_TAG=$(curl -fsSL -o /dev/null -w "%{url_effective}" "https://github.com/${REPO}/releases/latest" 2>/dev/null | rev | cut -d/ -f1 | rev || true)
    if [ -n "${LATEST_TAG}" ] && [ "${LATEST_TAG}" != "latest" ]; then
        info "Checking out latest stable tag: ${LATEST_TAG}"
        git clone --depth 1 -b "${LATEST_TAG}" "${CLONE_URL}" "${CLONE_DIR}"
    else
        git clone --depth 1 "${CLONE_URL}" "${CLONE_DIR}"
    fi

    info "Running cargo build --release (this may take 2-5 minutes)..."
    (cd "${CLONE_DIR}/musu-rs" && cargo build --release)

    cp "${CLONE_DIR}/musu-rs/target/release/musu" "${TMPDIR_INSTALL}/musu"
    chmod +x "${TMPDIR_INSTALL}/musu"
    ok "Build complete"
fi

# ── Step 3: Install binary ───────────────────────────────────────────────────
INSTALL_DIR=""
MUSU_BIN=""

# Prefer /usr/local/bin if writable (or if we can sudo)
if [ -w "/usr/local/bin" ]; then
    INSTALL_DIR="/usr/local/bin"
    MUSU_BIN="${INSTALL_DIR}/musu"
    info "Installing to ${MUSU_BIN}..."
    cp "${TMPDIR_INSTALL}/musu" "${MUSU_BIN}"
    chmod +x "${MUSU_BIN}"
elif command -v sudo &>/dev/null; then
    INSTALL_DIR="/usr/local/bin"
    MUSU_BIN="${INSTALL_DIR}/musu"
    warn "Global installation to /usr/local/bin requires root privileges."
    info "Installing to ${MUSU_BIN} (sudo)..."
    sudo cp "${TMPDIR_INSTALL}/musu" "${MUSU_BIN}"
    sudo chmod +x "${MUSU_BIN}"
else
    # Fall back to ~/.musu/bin
    INSTALL_DIR="${HOME}/.musu/bin"
    MUSU_BIN="${INSTALL_DIR}/musu"
    mkdir -p "${INSTALL_DIR}"
    info "Installing to ${MUSU_BIN}..."
    cp "${TMPDIR_INSTALL}/musu" "${MUSU_BIN}"
    chmod +x "${MUSU_BIN}"

    # Add to PATH if not already there
    if ! echo "${PATH}" | tr ':' '\n' | grep -qx "${INSTALL_DIR}"; then
        warn "${INSTALL_DIR} is not in your PATH"
        # Try to add to shell profile
        SHELL_NAME="$(basename "${SHELL:-/bin/bash}")"
        PROFILE=""
        case "${SHELL_NAME}" in
            zsh)  PROFILE="${HOME}/.zshrc" ;;
            bash)
                if [ -f "${HOME}/.bashrc" ]; then
                    PROFILE="${HOME}/.bashrc"
                elif [ -f "${HOME}/.bash_profile" ]; then
                    PROFILE="${HOME}/.bash_profile"
                fi
                ;;
            fish) PROFILE="${HOME}/.config/fish/config.fish" ;;
        esac

        if [ -n "${PROFILE}" ]; then
            EXPORT_LINE="export PATH=\"\${HOME}/.musu/bin:\${PATH}\""
            if [ "${SHELL_NAME}" = "fish" ]; then
                EXPORT_LINE="set -gx PATH \$HOME/.musu/bin \$PATH"
            fi
            if ! grep -qF ".musu/bin" "${PROFILE}" 2>/dev/null; then
                printf '\n# MUSU\n%s\n' "${EXPORT_LINE}" >> "${PROFILE}"
                ok "Added ${INSTALL_DIR} to ${PROFILE}"
            fi
        fi
        info "Run: ${DIM}export PATH=\"\${HOME}/.musu/bin:\${PATH}\"${NC}  (or restart your shell)"
    fi
fi

ok "Binary installed: ${MUSU_BIN}"

# ── Step 4: Run musu install ─────────────────────────────────────────────────
info "Running musu install..."
if "${MUSU_BIN}" install 2>&1; then
    ok "Config seeded"
else
    warn "musu install returned non-zero — check output above"
fi

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
printf "${GREEN}${BOLD}✓ MUSU installed successfully!${NC}\n"
echo ""
echo "  Binary:  ${MUSU_BIN}"
echo "  Config:  ~/.musu/"
echo ""
echo "  Get started:"
echo "    ${DIM}musu bridge${NC}           — start the bridge server"
echo "    ${DIM}musu doctor${NC}           — check system health"
echo "    ${DIM}musu --help${NC}           — see all commands"
echo ""
echo "  Docs:    https://github.com/${REPO}#readme"
echo ""
