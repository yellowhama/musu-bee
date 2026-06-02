# MUSU Manual

> AI team runtime that runs on your machines.
> Your AI companies build software, research topics, and manage projects autonomously.

---

## What is MUSU?

MUSU runs AI agent teams on your local devices. Each device has a CEO that manages projects through team leads, engineers, and QA agents. Multiple devices share work through a mesh network.

```
Your Device
  ?붴? musu-rs (:8070) ??Single Rust binary replacing legacy python bridges (Now V27 Single Binary Rust)
       ?쒋? CEO ??manages all projects, delegates to team leads
       ?쒋? Team Lead ??runs one project, delegates to engineers
       ?쒋? Engineer (Gemini) ??writes code, runs tests
       ?쒋? QA (Claude) ??reviews and scores work
       ?붴? Node Manager ??reports device health

Connected to (optional, not required for single-machine use):
  ?쒋? Other local devices via mDNS (Local Peer Discovery)
  ?쒋? Cloud remote devices via musu.pro registry (Token Binding)
  ?붴? #ceo-board for inter-device coordination
```

---

## Quick Start

For single-machine installation, use the zero-dependency one-liner:

**Linux/macOS:**
```bash
curl -fsSL https://musu.pro/install.sh | bash
```

**Windows (PowerShell):**
```powershell
iwr https://musu.pro/install.ps1 -useb | iex
```

Windows distribution note:
- The one-liner above is the **current direct-download/operator path**.
- The intended Windows product direction is a **Store/MSIX packaged runtime** with package-managed install/update.
- Store/MSIX builds must not depend on raw bootstrap download, binary self-copy under `~/.musu/bin`, Task Scheduler registration, or MUSU-managed self-update.
- Reference: [`STORE_MSIX_AUDIT_2026_05_27.md`](STORE_MSIX_AUDIT_2026_05_27.md), [`PRODUCT_CHARTER/WINDOWS_DISTRIBUTION_PIVOT_2026-05-27.md`](PRODUCT_CHARTER/WINDOWS_DISTRIBUTION_PIVOT_2026-05-27.md)

Set the bearer token once per shell:

```bash
export BRIDGE_PORT=$(jq -r '.addr' ~/.musu/services/bridge.json | cut -d: -f2)
export MUSU_BRIDGE_TOKEN=$(grep '^MUSU_BRIDGE_TOKEN=' ~/.musu/bridge.env | cut -d= -f2)
```

All curl examples below assume `$MUSU_BRIDGE_TOKEN` is exported.

---

## Daily Operations

### Check if everything is working

```bash
curl http://localhost:\$BRIDGE_PORT/health
# {"status":"ok"}
```

### Check success rate

```bash
curl http://localhost:\$BRIDGE_PORT/api/stats/success-rate?days=1
# Shows: done/failed/running counts + success percentage
```

### See what the CEO is doing

```bash
# Recent CEO activity
sqlite3 ~/.musu/musu.db "SELECT status, substr(output,1,100), created_at FROM route_executions WHERE channel='ceo' ORDER BY created_at DESC LIMIT 3;"
```

### Trigger CEO heartbeat manually

```bash
curl -X POST http://localhost:\$BRIDGE_PORT/api/agents/{CEO_ID}/heartbeat/invoke \
  -H "Authorization: Bearer $MUSU_BRIDGE_TOKEN" \
  -H "Content-Type: application/json" -d '{}'
```

### Give feedback (as chairman)

```bash
curl -X POST http://localhost:\$BRIDGE_PORT/api/feedback \
  -H "Authorization: Bearer $MUSU_BRIDGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "Fix the login page", "type": "bug"}'
# Creates an issue ??CEO picks it up on next heartbeat
```

---

## Multi-Device Operations

### Update a remote node

```bash
curl -X POST http://{REMOTE_IP}:8070/api/system/update \
  -H "Authorization: Bearer $MUSU_BRIDGE_TOKEN"
# Runs git pull + apply-agent-defaults.py + restart if needed
```

This flow applies to direct-download nodes. Store/MSIX packaged Windows nodes must use Windows / Store-managed updates and reject MUSU-managed self-update.

### Team channels (wiki/008)

Each company has a team channel. Replies trigger notifications.

```
Channels: ceo-board, md-team, my-team
```

```bash
# Post
curl -X POST http://localhost:\$BRIDGE_PORT/api/groups/my-team/messages \
  -H "Authorization: Bearer $MUSU_BRIDGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text": "Draft ready", "sender_id": "writer-1"}'

# Reply (notifies original author)
curl -X POST http://localhost:\$BRIDGE_PORT/api/groups/my-team/messages \
  -H "Authorization: Bearer $MUSU_BRIDGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text": "Looks good", "sender_id": "editor-1", "reply_to": "msg-id"}'

# Check your notifications
curl http://localhost:\$BRIDGE_PORT/api/notifications/writer-1 \
  -H "Authorization: Bearer $MUSU_BRIDGE_TOKEN"
```

### Read channel messages

```bash
curl http://localhost:\$BRIDGE_PORT/api/groups/ceo-board/messages?limit=5 \
  -H "Authorization: Bearer $MUSU_BRIDGE_TOKEN"
```

### Change model distribution (all nodes)

Edit `.musu/agent-defaults.json`, then:
```bash
git add .musu/agent-defaults.json && git commit -m "update models" && git push
# Then remote-update each node:
curl -X POST http://{NODE_IP}:8070/api/system/update \
  -H "Authorization: Bearer $MUSU_BRIDGE_TOKEN"
```

### Browse files on another device

```bash
# List files
curl "http://{NODE_IP}:8070/api/files/list?path=/home/user&pattern=*.md" \
  -H "Authorization: Bearer $MUSU_BRIDGE_TOKEN"

# Read a file
curl "http://{NODE_IP}:8070/api/files/read?path=/home/user/project/chapter1.md" \
  -H "Authorization: Bearer $MUSU_BRIDGE_TOKEN"
```

Security: files restricted to home directory. Auth token required.

### Mesh File Proxy (V27+)

Transparently stream or download large files directly from a remote node via HTTP ranges without memory bloat.

```bash
curl "http://localhost:\$BRIDGE_PORT/api/v1/fs/proxy/{NODE_ID}/path/to/remote/file.mp4" \
  -H "Authorization: Bearer $MUSU_BRIDGE_TOKEN" \
  -H "Range: bytes=0-1024"
```

### WebRTC Remote View (V27+)

Request a low-latency WebRTC P2P view of a remote machine's screen. The remote bridge leverages a lightweight MJPEG data channel over WebRTC to broadcast its screen without heavy H.264 video dependencies.

```bash
# Initiate signaling
curl -X POST "http://localhost:\$BRIDGE_PORT/api/webrtc/offer" \
  -H "Authorization: Bearer $MUSU_BRIDGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sdp": "...", "type": "offer"}'
```

The simplest way to use this is via `musu-bee` Web UI under the Machine View (`/app/m/<MACHINE_ID>`).

### Universal Clipboard (V28)

MUSU automatically polls the OS clipboard on every device and broadcasts text changes to the fleet. To programmatically update the clipboard of a node:

```bash
curl -X POST "http://localhost:\$BRIDGE_PORT/api/clipboard/write" \
  -H "Authorization: Bearer $MUSU_BRIDGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text": "Copied from another device!"}'
```

### Restart services on another device

```bash
# Restart all services
curl -X POST "http://{NODE_IP}:8070/api/system/restart?service=all" \
  -H "Authorization: Bearer $MUSU_BRIDGE_TOKEN"

# Restart just bridge
curl -X POST "http://{NODE_IP}:8070/api/system/restart?service=bridge" \
  -H "Authorization: Bearer $MUSU_BRIDGE_TOKEN"

# Check service statuses
curl "http://{NODE_IP}:8070/api/system/services" \
  -H "Authorization: Bearer $MUSU_BRIDGE_TOKEN"
```

---

## Security (wiki/005, wiki/009)

### Secrets Vault

All tokens and credentials live in one place:

```bash
~/.musu/secrets/vault.json    # chmod 600, never committed to git
```

```bash
# List secrets (masked)
bash scripts/vault.sh list

# Get a specific secret
bash scripts/vault.sh get bridge.token

# Export as env vars for curl commands
source scripts/vault.sh export
curl http://localhost:\$BRIDGE_PORT/health -H "Authorization: Bearer $MUSU_BRIDGE_TOKEN"
```

Agents use MCP: `get_vault_secret("bridge.token")`

### First Setup

```bash
# init.sh generates a random token automatically.
# Or manually:
openssl rand -hex 32
# Put it in ~/.musu/secrets/vault.json under bridge.token
```

Never hardcode tokens in code, wiki, or instructions. Always read from vault.

---

## Company (Project) Management

### Create a new project

```bash
curl -X POST http://localhost:\$BRIDGE_PORT/api/companies \
  -H "Authorization: Bearer $MUSU_BRIDGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "My App", "template_key": "dev-team", "purpose": "Build a web app"}'
# ??{"company": {"id": "<COMPANY_ID>", ...}, "agents": [...], "governance": {...}}
# Extract id: ... | jq -r '.company.id'
```

The response wraps the company row under `company`, the auto-created
agents under `agents`, and the template's harness governance config
under `governance`. Extracting just the id:

```bash
COMPANY_ID=$(curl -s -X POST http://localhost:\$BRIDGE_PORT/api/companies \
  -H "Authorization: Bearer $MUSU_BRIDGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"My App","template_key":"dev-team","purpose":"..."}' \
  | jq -r '.company.id')
```

Templates: `dev-team`, `content-team`, `research-team`, `writer-studio`

### Get project briefing (Chairman Principle)

```bash
curl http://localhost:\$BRIDGE_PORT/api/companies/{ID}/briefing \
  -H "Authorization: Bearer $MUSU_BRIDGE_TOKEN"
# Returns: name, purpose, status, summary, blockers, recent wins
```

### Activate/Deactivate a project

```bash
curl -X POST http://localhost:\$BRIDGE_PORT/api/companies/{ID}/activate
curl -X POST http://localhost:\$BRIDGE_PORT/api/companies/{ID}/deactivate
```

### Kick CEO to work on a project

```bash
curl -X POST http://localhost:\$BRIDGE_PORT/api/companies/{ID}/run \
  -H "Authorization: Bearer $MUSU_BRIDGE_TOKEN"
```

---

## Agent Management

### List agents

```bash
curl http://localhost:\$BRIDGE_PORT/api/agents \
  -H "Authorization: Bearer $MUSU_BRIDGE_TOKEN"
```

### Pause/Resume an agent

```bash
curl -X POST http://localhost:\$BRIDGE_PORT/api/agents/{ID}/pause
curl -X POST http://localhost:\$BRIDGE_PORT/api/agents/{ID}/resume
```

### Update agent model

```bash
curl -X PATCH http://localhost:\$BRIDGE_PORT/api/agents/{ID} \
  -H "Content-Type: application/json" \
  -d '{"model": "gemini-2.5-flash"}'
```

### Model distribution

| Model | Agents | Why |
|-------|--------|-----|
| Claude | CEO, CTO, QA | Judgment, evaluation |
| Gemini | Engineer, Planner, Team Lead, Worker | Speed, volume |
| Codex | CoS, VP, Node Manager | Simple tasks |

Auto-fallback: Claude ??Gemini ??Codex (if rate limited)

---

## Task Delegation

### Delegate a task

```bash
curl -X POST http://localhost:\$BRIDGE_PORT/api/tasks/delegate \
  -H "Authorization: Bearer $MUSU_BRIDGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"channel": "engineer", "text": "Fix the login bug in auth.py line 45. pytest tests/test_auth.py should pass."}'
# Returns: {"task_id": "..."}
```

### Poll task status

```bash
curl http://localhost:\$BRIDGE_PORT/api/tasks/{TASK_ID} \
  -H "Authorization: Bearer $MUSU_BRIDGE_TOKEN"
# Returns: {status: "done"/"running"/"failed", summary: "..."}
```

---

## Issues & Goals

### Create an issue

```bash
curl -X POST http://localhost:\$BRIDGE_PORT/api/companies/{CID}/issues \
  -H "Content-Type: application/json" \
  -d '{"title": "Login page broken", "priority": "high"}'
```

### Create a goal

```bash
curl -X POST http://localhost:\$BRIDGE_PORT/api/companies/{CID}/goals \
  -H "Content-Type: application/json" \
  -d '{"title": "Ship v2.0 by end of month"}'
```

---

## Knowledge Base (Wiki)

### Search wiki

```bash
curl http://localhost:\$BRIDGE_PORT/api/wiki/search?q=authentication
```

### Read a page

```bash
curl http://localhost:\$BRIDGE_PORT/api/wiki/page/001_CHAIRMAN_PRINCIPLE
```

### Write a page

```bash
curl -X POST http://localhost:\$BRIDGE_PORT/api/wiki/page/my-notes \
  -H "Content-Type: application/json" \
  -d '{"content": "# My Notes\n\nSome content here."}'
```

---

## Troubleshooting

### UI won't load (port 3001)

```bash
# Check service status
systemctl --user status musu-bee
# Check logs:
journalctl --user -u musu-bee -n 20 --no-pager
```

Services auto-start on boot (`loginctl enable-linger`). If a service dies, systemd restarts it.

### Bridge won't start

```bash
journalctl --user -u musu-bridge -n 30 --no-pager
# Check for: import errors, port conflicts, DB locked
```

### Agent returns "unavailable"

```bash
# Check if CLI tool is installed
which claude gemini codex
# Check agent adapter type
sqlite3 ~/.musu/musu.db "SELECT name, adapter_type FROM agents WHERE status='active';"
# If claude not working, switch to gemini:
python3 scripts/apply-agent-defaults.py
```

### Remote node unreachable

```bash
# Check Tailscale
tailscale ping {NODE_IP}
# Check bridge health
curl http://{NODE_IP}:8070/health
# Force update
curl -X POST http://{NODE_IP}:8070/api/system/update \
  -H "Authorization: Bearer $MUSU_BRIDGE_TOKEN"
```

### High failure rate

```bash
curl http://localhost:\$BRIDGE_PORT/api/stats/success-rate?days=1
# If high failures: check agent CLI availability, rate limits, timeouts
# Archive old failures:
sqlite3 ~/.musu/musu.db "DELETE FROM route_executions WHERE status='failed' AND created_at < date('now', '-7 days');"
```

---

## Configuration Reference

### .env (musu-bridge)

| Variable | Default | Purpose |
|----------|---------|---------|
| MUSU_BRIDGE_TOKEN | (required) | API authentication |
| BRIDGE_HOST | 127.0.0.1 | Bind address. Set `0.0.0.0` to listen on LAN/Tailscale. LAN clients ALWAYS need the bearer token; localhost does too unless explicitly opted out for local development. |
| MUSU_BRIDGE_LOCALHOST_AUTH | auth required | Auth is required by default, including `127.0.0.1`/`::1`. Set `0` only for explicit local development bypass on a trusted single-user machine. |
| BRIDGE_PORT | 8070 | HTTP port |
| MUSU_NODE_NAME | hostname | Device identifier |
| MUSU_TOKEN | | Cloud registry token |
| MUSU_RELAY_ENABLED | false | Enable relay tunnel |
| MUSU_CEO_HEARTBEAT_ENABLED | false | Auto-run CEO |
| MUSU_CEO_HEARTBEAT_INTERVAL | 1800 | Seconds between runs |
| MUSU_SELF_HEALING_ENABLED | true | Pre-heartbeat diagnostics |
| MUSU_MAX_CONCURRENT_TASKS | 20 | Task parallelism limit |

### .musu/agent-defaults.json

Central model distribution. Push to Forgejo, remote-update nodes.

### .musu/charter.md

Company strategy: mission, priorities, constraints, Chairman Principle.

---

## Architecture

```
musu-rs (Rust)                   ??Single-binary core (replaces Python bridge, core, control, indexer). Handles API (:8070), agent dispatch, mDNS discovery, and P2P mesh
musu-bee (Next.js)               ??Full-stack web application (port 3001) serving as both the local dashboard and the musu.pro cloud SaaS (billing, auth, registry)
Forgejo                          ??local Git server for code sharing (optional)
```

---

## The Chairman Principle (wiki/001)

**The #1 rule for everything.**

You are a subsidiary president. The user is the chairman.
- 3-second briefing: what, how, what needs attention
- Results, not processes
- No data dumps, no technical jargon
- Handle everything yourself, report outcomes only
