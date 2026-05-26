#!/bin/bash
# musu-bee Unix/macOS 1-Liner Installer
# Usage: curl -sSf https://raw.githubusercontent.com/yellowhama/musu-bee/main/install.sh | bash

set -e

echo -e "\033[1;36m>>> Fetching latest release info from GitHub...\033[0m"

OS="$(uname -s)"
ARCH="$(uname -m)"

case "${OS}" in
    Linux*)     OS_SUFFIX="linux";;
    Darwin*)    OS_SUFFIX="macos";;
    *)          echo "Unsupported OS: ${OS}" && exit 1;;
esac

case "${ARCH}" in
    x86_64*)    ARCH_SUFFIX="x86_64";;
    arm64*|aarch64*) ARCH_SUFFIX="arm64";;
    *)          echo "Unsupported architecture: ${ARCH}" && exit 1;;
esac

# Construct the asset suffix (e.g. linux-x86_64 or macos-arm64)
TARGET_SUFFIX="${OS_SUFFIX}-${ARCH_SUFFIX}"

RELEASE_JSON=$(curl -s "https://api.github.com/repos/yellowhama/musu-bee/releases/latest")

# Extract download URLs for musu and musud
MUSU_URL=$(echo "$RELEASE_JSON" | grep "browser_download_url" | grep "musu-${TARGET_SUFFIX}" | head -n 1 | cut -d '"' -f 4)

if [ -z "$MUSU_URL" ]; then
    echo -e "\033[1;31mError: Could not find binaries for ${TARGET_SUFFIX} in the latest release.\033[0m"
    exit 1
fi

TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

echo -e "\033[1;36m>>> Downloading musu...\033[0m"
curl -sL "$MUSU_URL" -o "$TEMP_DIR/musu"
chmod +x "$TEMP_DIR/musu"

echo -e "\033[1;36m>>> Running musu installer...\033[0m"
cd "$TEMP_DIR"
./musu install

MUSU_BIN_PATH="$HOME/.musu/bin"

echo -e "\033[1;36m>>> Checking PATH...\033[0m"
if [[ ":$PATH:" != *":$MUSU_BIN_PATH:"* ]]; then
    # Determine the shell configuration file to update
    SHELL_RC=""
    if [[ "$SHELL" == *"zsh"* ]]; then
        SHELL_RC="$HOME/.zshrc"
    elif [[ "$SHELL" == *"bash"* ]]; then
        if [ -f "$HOME/.bash_profile" ]; then
            SHELL_RC="$HOME/.bash_profile"
        else
            SHELL_RC="$HOME/.bashrc"
        fi
    fi

    if [ -n "$SHELL_RC" ]; then
        echo -e "\n# Added by musu installer\nexport PATH=\"\$PATH:$MUSU_BIN_PATH\"" >> "$SHELL_RC"
        echo -e "\033[1;32m    Added $MUSU_BIN_PATH to $SHELL_RC\033[0m"
    else
        echo -e "\033[1;33m    Could not determine shell config file. Please manually add $MUSU_BIN_PATH to your PATH.\033[0m"
    fi
fi

echo -e "\n\033[1;32m========================================================\033[0m"
echo -e "\033[1;32m✅ musu installation completed successfully!\033[0m"
echo -e "\033[1;33mPlease restart your terminal (or run 'source ~/.bashrc' etc).\033[0m"
echo -e "\033[1;33mThen, connect this machine to your account by running:\033[0m"
echo -e "\033[1;37m    musu login\033[0m"
echo -e "\033[1;32m========================================================\033[0m\n"
