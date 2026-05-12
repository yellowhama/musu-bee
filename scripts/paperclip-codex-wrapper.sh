#!/usr/bin/env bash
set -euo pipefail

REAL_HOME="$(getent passwd "$(id -un)" | cut -d: -f6 || true)"

if [[ -n "${REAL_HOME:-}" ]]; then
  export HOME="$REAL_HOME"
fi

export PATH="$HOME/.cargo/bin${PATH:+:$PATH}"

exec "${MUSU_CODEX_BIN:-$HOME/.npm-global/bin/codex}" "$@"
