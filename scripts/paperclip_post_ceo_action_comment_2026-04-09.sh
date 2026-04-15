#!/usr/bin/env bash
set -euo pipefail

API_BASE="${PAPERCLIP_API_BASE:-http://127.0.0.1:3100/api}"
ISSUE_ID="${1:-d30c7dd6-afb2-4180-857c-787e7603005e}" # MUS-1016 umbrella by default

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

body_file="${tmp_dir}/body.md"
cat >"$body_file" <<'EOF'
CEO ACTION (delegable) — unblock the board without CEO doing keyboard work

Status update
- Worker mesh loop is unblocked: both nodes can run musu-worker on port 9700 and are reachable over Tailscale.
- start-worker.sh fix is pushed to origin/main (commit c7212204): if /health is already OK it prints "already running" and exits 0; it also auto-loads MUSU_WORKER_TOKEN from ~/.musu/worker_token.

Decision needed (pick 1)
1) Assign a single operator (recommended: Chief of Staff) to own the blocked/high 7 truth + evidence bundles.

Operator checklist (copy/paste; no CEO time required)
On EACH machine (WSL / Ubuntu):
  1) cd /home/hugh51/musu-functions && git pull origin main
  2) mkdir -p ~/.musu; umask 077; test -s ~/.musu/worker_token || openssl rand -hex 32 > ~/.musu/worker_token
  3) nohup ./scripts/start-worker.sh >/tmp/musu-worker-9700.log 2>&1 &
  4) curl -sf http://127.0.0.1:9700/health

On orchestrator (4060):
  5) cd /home/hugh51/musu-functions && python3 scripts/musu_mesh_healthcheck.py  (must show all nodes ok)

Security note
- Do NOT paste tokens into Paperclip. Keep them only in ~/.musu/worker_token on each node.
EOF

payload="$(jq -n --rawfile body "$body_file" '{body:$body}')"

curl -sS --max-time 5 -X POST \
  -H 'content-type: application/json' \
  -d "$payload" \
  "$API_BASE/issues/$ISSUE_ID/comments" \
  | jq -r '"OK comment posted: " + (.id // "")'

