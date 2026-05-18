#!/bin/sh
# musu-relay/scripts/start-rendezvous.sh
#
# V23.4 T2-F (wiki/433): convenience launcher for the self-hosted signaling
# rendezvous (user-server.ts). Production installs start this via OpenRC
# (installer/openrc-musu-signaling.conf + musu-init); this script is for
# local development, manual smoke testing, and the V23.4 Phase 4 cross-PC
# LAN smoke test in installer/test-signaling-smoke.ps1.
#
# Usage:
#   ./scripts/start-rendezvous.sh                       # default port 9900
#   MUSU_SIGNALING_PORT=8800 ./scripts/start-rendezvous.sh
#
# Builds first if dist/signaling/user-server.js is absent. Otherwise runs
# the prebuilt artifact (matches what musu-backend.tar will ship).

set -eu

cd "$(dirname "$0")/.."

PORT="${MUSU_SIGNALING_PORT:-9900}"
DIST="dist/signaling/user-server.js"

if [ ! -f "$DIST" ]; then
    echo "[start-rendezvous] building user-server (dist absent)"
    npm run build:user-server
fi

# Bind 0.0.0.0 inside user-server.ts so LAN peers can reach this PC.
# MUSU_SIGNALING_PORT is read by the entrypoint.
echo "[start-rendezvous] launching user-server on 0.0.0.0:${PORT}"
export MUSU_SIGNALING_PORT="${PORT}"
exec node "$DIST"
