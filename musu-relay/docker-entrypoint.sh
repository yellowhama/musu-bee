#!/bin/sh
# musu-signaling entrypoint (V23.2 audit HIGH #1).
#
# Why this exists: the Dockerfile chowns /data to musu:musu at build time,
# but Fly.io's volume mount overlays /data at runtime with a fresh,
# root-owned filesystem. Without this script, the first process that
# tries to write /data/telemetry.db crashes with EACCES and the machine
# enters a boot loop.
#
# This script runs as root, chowns the mountpoint, then drops to the
# musu user via su-exec (Alpine's lightweight gosu equivalent) before
# exec'ing the real command.

set -eu

# Only chown if /data exists and is currently writable by root (i.e. is
# the freshly-mounted volume). On subsequent boots the volume is already
# owned by musu:musu so we skip the chown to keep startup snappy.
if [ -d /data ] && [ "$(stat -c %u /data)" != "1001" ]; then
    chown -R musu:musu /data
fi

exec su-exec musu:musu "$@"
