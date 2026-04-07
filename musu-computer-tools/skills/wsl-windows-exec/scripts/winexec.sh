#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: winexec.sh <windows-exe-path> [args...]" >&2
  exit 2
fi

if [ -x /init ]; then
  interop_launcher=/init
elif [ -x /var/lib/snapd/hostfs/init ]; then
  interop_launcher=/var/lib/snapd/hostfs/init
else
  echo "No WSL interop launcher found at /init or /var/lib/snapd/hostfs/init" >&2
  exit 127
fi

exec "$interop_launcher" "$@"
