#!/bin/bash
set -euo pipefail

ROOT="/home/hugh51/.local/share/codex-mcp/rootless-computer-control"
BIN="$ROOT/root/usr/bin/scrot"
LIB="$ROOT/root/usr/lib/x86_64-linux-gnu"
LOADERS="$LIB/imlib2/loaders"
REQUEST_DIR="$ROOT/helper-requests"

mkdir -p "$REQUEST_DIR"

export DISPLAY=:0
export LD_LIBRARY_PATH="$LIB:/mnt/wslg/distro/usr/lib/x86_64-linux-gnu:/mnt/wslg/distro/lib/x86_64-linux-gnu:/mnt/wslg/distro/usr/lib:/mnt/wslg/distro/lib:${LD_LIBRARY_PATH:-}"
export IMLIB2_LOADER_PATH="$LOADERS"

while true; do
  shopt -s nullglob
  requests=("$REQUEST_DIR"/*.req)
  shopt -u nullglob

  if [ "${#requests[@]}" -eq 0 ]; then
    sleep 0.05
    continue
  fi

  for req in "${requests[@]}"; do
    res="${req%.req}.res"
    out="$(cat "$req")"

    if err="$("$BIN" "$out" 2>&1)"; then
      printf 'OK\n' > "$res"
    else
      printf '%s\n' "${err:-Screenshot helper failed}" > "$res"
    fi

    rm -f "$req"
  done
done
