#!/usr/bin/env bash
set -euo pipefail

HOSTFS_ROOT=/var/lib/snapd/hostfs
HOSTFS_LIBS="$HOSTFS_ROOT/usr/lib/x86_64-linux-gnu:$HOSTFS_ROOT/lib/x86_64-linux-gnu:$HOSTFS_ROOT/usr/lib:$HOSTFS_ROOT/lib"
REAL_HOME="$(getent passwd "$(id -un)" | cut -d: -f6)"

export HOME="${REAL_HOME:-${HOME:-}}"
export CARGO_HOME="${CARGO_HOME:-$HOME/.cargo}"
export RUSTUP_HOME="${RUSTUP_HOME:-$HOME/.rustup}"
export PATH="$HOSTFS_ROOT/usr/bin:$CARGO_HOME/bin:${PATH:-}"
export LD_LIBRARY_PATH="$HOSTFS_LIBS${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

exec "$@"
