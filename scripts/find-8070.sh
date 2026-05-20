#!/bin/sh
# One-shot: find PID holding :8070 inside this WSL distro.
set -e
hex_port='1F86'  # 8070 in hex
inode=$(awk -v p="$hex_port" '$2 ~ (":"p"$") {print $10}' /proc/net/tcp | head -1)
echo "port-8070 inode=$inode"
[ -z "$inode" ] && { echo "no listener on :8070 in this distro"; exit 0; }
for pid in $(ls /proc | grep -E '^[0-9]+$'); do
  for fd in /proc/$pid/fd/*; do
    [ -e "$fd" ] || continue
    link=$(readlink "$fd" 2>/dev/null) || continue
    if [ "$link" = "socket:[$inode]" ]; then
      cmd=$(tr '\0' ' ' < /proc/$pid/cmdline 2>/dev/null)
      echo "PID=$pid CMD=$cmd"
    fi
  done
done
