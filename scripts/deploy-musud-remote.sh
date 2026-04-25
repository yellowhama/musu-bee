#!/usr/bin/env bash
# Deploy musud to a remote node
# Usage: ./scripts/deploy-musud-remote.sh <tailscale_ip>
set -euo pipefail

NODE_IP="${1:?Usage: $0 <tailscale_ip>}"
echo "=== Deploying musud to $NODE_IP ==="

# 1. Copy binaries
scp ~/musu-functions/bin/musud ~/musu-functions/bin/musu "$NODE_IP":~/musu-functions/bin/
echo "✅ binaries copied"

# 2. Copy start scripts
scp ~/musu-functions/scripts/start-bridge.sh ~/musu-functions/scripts/start-bee.sh "$NODE_IP":~/musu-functions/scripts/
echo "✅ start scripts copied"

# 3. Copy systemd service
scp ~/musu-functions/scripts/systemd/musud.service "$NODE_IP":~/.config/systemd/user/
echo "✅ systemd service copied"

# 4. Copy musu.toml (customize for remote node)
scp ~/.musu/musu.toml "$NODE_IP":~/.musu/musu.toml
echo "✅ musu.toml copied (edit services for this node)"

# 5. Enable and start
ssh "$NODE_IP" "systemctl --user daemon-reload && systemctl --user enable musud && systemctl --user start musud"
echo "✅ musud started on $NODE_IP"

# 6. Verify
sleep 5
ssh "$NODE_IP" "~/musu-functions/bin/musu status"
echo "=== Done ==="
