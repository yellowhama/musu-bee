#!/usr/bin/env bash
set -euo pipefail

if [[ -x /usr/bin/g++ ]]; then
  exec /usr/bin/g++ "$@"
fi

exec g++ "$@"
