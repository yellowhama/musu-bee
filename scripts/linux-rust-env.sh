#!/usr/bin/env bash
set -euo pipefail

REAL_HOME="$(getent passwd "$(id -un)" | cut -d: -f6 || true)"

if [[ -z "${REAL_HOME:-}" ]]; then
  REAL_HOME="${HOME:-}"
fi

export HOME="${REAL_HOME}"
export CARGO_HOME="${CARGO_HOME:-$HOME/.cargo}"
export RUSTUP_HOME="${RUSTUP_HOME:-$HOME/.rustup}"
export PATH="$CARGO_HOME/bin${PATH:+:$PATH}"

if [[ "$#" -eq 0 ]]; then
  echo "HOME=$HOME"
  echo "CARGO_HOME=$CARGO_HOME"
  echo "RUSTUP_HOME=$RUSTUP_HOME"
  echo "cargo=$(command -v cargo || true)"
  cargo --version || true
  echo "rustc=$(command -v rustc || true)"
  rustc --version || true
  exit 0
fi

exec "$@"
