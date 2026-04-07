#!/usr/bin/env bash
set -euo pipefail

if [[ -x /usr/bin/gcc ]]; then
  exec /usr/bin/gcc "$@"
fi

exec gcc "$@"
