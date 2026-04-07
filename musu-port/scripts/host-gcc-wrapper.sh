#!/usr/bin/env bash
set -euo pipefail

HOSTFS_ROOT=/var/lib/snapd/hostfs
HOSTFS_LIBS="$HOSTFS_ROOT/usr/lib/x86_64-linux-gnu:$HOSTFS_ROOT/lib/x86_64-linux-gnu:$HOSTFS_ROOT/usr/lib:$HOSTFS_ROOT/lib"

export PATH="$HOSTFS_ROOT/usr/bin:${PATH:-}"
export LD_LIBRARY_PATH="$HOSTFS_LIBS${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

exec "$HOSTFS_ROOT/usr/bin/gcc" --sysroot="$HOSTFS_ROOT" "$@"
