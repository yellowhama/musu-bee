# MUSU Node Onboarding

**Adding another machine to an existing MUSU mesh.** For *first*
single-machine setup, use [`../QUICKSTART.md`](../QUICKSTART.md) — this
doc assumes a bridge is already running somewhere on your tailnet.

## Prerequisites

- Python 3.12+
- Node.js 20+ (for CLI tools)
- Tailscale installed and connected to the same network
- One of: Claude / Gemini / Codex CLI subscription

## Quick Start (5 minutes)

### 1. Clone

```bash
git clone https://github.com/yellowhama/musu-bee.git ~/musu-bee
cd ~/musu-bee
```

### 2. Install Python packages

The musu Python modules use editable installs from their `pyproject.toml`
— there is no `requirements.txt`. The convenience installer handles all
of this in one command (`bash scripts/install.sh --service --start`).
Manual equivalent:

```bash
cd musu-bridge && python3 -m venv .venv && source .venv/bin/activate && pip install -e . && deactivate
cd ../musu-core && python3 -m venv .venv && source .venv/bin/activate && pip install -e . && deactivate
cd ../musu-control && python3 -m venv .venv && source .venv/bin/activate && pip install -e . && deactivate
cd ..
```

### 3. Install AI CLIs

```bash
npm install -g @anthropic-ai/claude-code    # Claude
npm install -g @anthropic-ai/gemini-cli     # Gemini
npm install -g @openai/codex                # Codex
# Login to each: claude login, etc.
```

### 4. Configure

```bash
# Run init.sh — generates token, copies templates, installs deps
bash scripts/init.sh
```

Or manually:

```bash
mkdir -p ~/.musu/secrets && chmod 700 ~/.musu/secrets

# Generate secure token
TOKEN=$(openssl rand -hex 32)

# Create vault (wiki/009)
cat > ~/.musu/secrets/vault.json << EOF
{
  "bridge": {"token": "$TOKEN"},
  "cloud": {"musu_token": ""},
  "forgejo": {"user": "musu_admin", "pass": "musu_admin", "url": ""},
  "nodes": {}
}
EOF
chmod 600 ~/.musu/secrets/vault.json

# Create .env from vault token
cat > musu-bridge/.env << EOF
MUSU_BRIDGE_TOKEN=$TOKEN
BRIDGE_HOST=0.0.0.0
BRIDGE_PORT=8070
MUSU_NODE_NAME=YOUR_NODE_NAME
MUSU_CEO_HEARTBEAT_ENABLED=true
MUSU_CEO_HEARTBEAT_INTERVAL=1800
MUSU_NODE_HEARTBEAT_ENABLED=true
EOF
```

Replace `YOUR_NODE_NAME` with your device name (e.g., `laptop`, `desktop`, `server`).

### 5. Seed agents + Apply model distribution

```bash
musu-bridge/.venv/bin/python musu-bridge/seed_agents.py
python3 scripts/apply-agent-defaults.py
```

### 6. Connect to a shared Git server (optional)

> **Optional, opt-in only.** V23.4+ musu does not require a shared
> Forgejo / Gitea / GitHub server. The mesh works fine without one.
> Skip this section unless you already operate a shared Git host for
> agent code sync.

If you DO run a shared Git server, register it as a Git remote with
your own credentials — NEVER paste someone else's IP or token here:

```bash
# Replace with YOUR shared Git host + YOUR credentials
git remote add forgejo "https://<YOUR_GIT_HOST>/<ORG>/musu-project.git"
git config --global credential.helper store
git fetch forgejo
```

Use a personal access token (not username:password) and let
`credential.helper store` save it after the first `git fetch` prompt.

### 7. Start

```bash
# Linux (systemd)
cp scripts/systemd/musu-bridge.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now musu-bridge

# Or manual
cd musu-bridge && .venv/bin/python server.py
```

### 8. Verify

```bash
# Local health
curl http://localhost:8070/health

# Mesh connection (replace <MESH_PEER_IP> with the existing node's Tailscale IP)
curl http://<MESH_PEER_IP>:8070/health -H "Authorization: Bearer $MUSU_BRIDGE_TOKEN"

# Announce on CEO board
curl -X POST http://localhost:8070/api/groups/ceo-board/messages \
  -H "Authorization: Bearer $MUSU_BRIDGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text": "NEW_NODE online. Mesh connected.", "sender_id": "ceo-NEW_NODE"}'
```

## How It Works

```
Your Device
  └─ musu-bridge (:8070)
       ├─ CEO agent (Claude) — manages your projects
       ├─ Engineer (Gemini) — writes code
       ├─ QA (Claude) — reviews code
       └─ Node Manager — reports device health

       Optional integrations (not required):
       ├─ Shared Git host (Forgejo/Gitea/GitHub) — code sync between
       │  nodes when you operate one. Self-contained product positioning
       │  ([[feedback-self-contained-product]]) makes this opt-in.
       ├─ #ceo-board — inter-device CEO group chat (built into bridge,
       │  no external service needed)
       └─ musu.pro — remote-access SaaS. V23.4+ optional; the bridge
          itself runs locally with no SaaS dep.
```

## Key Files

| File | Purpose |
|------|---------|
| `.musu/charter.md` | Company mission and rules |
| `.musu/agent-defaults.json` | Model distribution config |
| `musu-bridge/.env` | Node-specific environment |
| `musu-bridge/instructions/*.md` | Agent behavior |

## Writer Studio Setup

For a fiction workspace, use the writer-company provisioning script with
your own workspace path:

```bash
python3 scripts/setup-writer-company.py --workspace-root ~/writer
```

This expects (under `<workspace-root>`):

- `.musu/company.json`
- `.musu/charter.md`
- `.musu/agent-defaults.json`

The active company manifest lives at `~/.musu/companies/<id>.yaml`. Set
`MUSU_COMPANY_YAML=~/.musu/companies/<id>.yaml` (or `MUSU_COMPANY_ID=<id>`)
to bind the bridge to it.

## Updating

When notified via #ceo-board:

```bash
cd ~/musu-bee
git pull                                       # or `git pull forgejo main` if you registered one
python3 scripts/apply-agent-defaults.py
systemctl --user restart musu-bridge
```

## The Chairman Principle (wiki/001)

The user is the chairman. You are a subsidiary president.
Report in results, not processes. No data dumps. Ever.
