# MUSU Node Onboarding

New device? New user? Follow this guide to join the mesh.

## Prerequisites

- Python 3.12+
- Node.js 20+ (for CLI tools)
- Tailscale installed and connected to the same network
- One of: Claude / Gemini / Codex CLI subscription

## Quick Start (5 minutes)

### 1. Clone

```bash
git clone https://github.com/yellowhama/musu-bee.git ~/musu-functions
cd ~/musu-functions
```

### 2. Install Python packages

```bash
cd musu-bridge && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt && deactivate
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
mkdir -p ~/.musu
cat > musu-bridge/.env << 'EOF'
MUSU_BRIDGE_TOKEN=local-dev-token-change-in-prod
BRIDGE_HOST=0.0.0.0
BRIDGE_PORT=8070
MUSU_NODE_NAME=YOUR_NODE_NAME
MUSU_TOKEN=e8c464ed3508370bce2bb27298ab6ee16aa92dcf5e25c076
MUSU_RELAY_ENABLED=true
MUSU_RELAY_URL=https://musu-relay-production.up.railway.app
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

### 6. Connect to Forgejo (central Git)

```bash
git remote add forgejo http://100.126.67.88:3000/musu_admin/musu-project.git
git config --global credential.helper store
echo "http://musu_admin:musu_admin@100.126.67.88:3000" >> ~/.git-credentials
chmod 600 ~/.git-credentials
git fetch forgejo
```

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

# Mesh connection (to 4060)
curl http://100.126.67.88:8070/health -H "Authorization: Bearer local-dev-token-change-in-prod"

# Announce on CEO board
curl -X POST http://localhost:8070/api/groups/ceo-board/messages \
  -H "Authorization: Bearer local-dev-token-change-in-prod" \
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

       Connected to:
       ├─ Forgejo (Git sync) — central code repository
       ├─ #ceo-board — inter-device CEO group chat
       └─ musu.pro relay — remote access via web
```

## Key Files

| File | Purpose |
|------|---------|
| `.musu/charter.md` | Company mission and rules |
| `.musu/agent-defaults.json` | Model distribution config |
| `musu-bridge/.env` | Node-specific environment |
| `musu-bridge/instructions/*.md` | Agent behavior |

## Updating

When notified via #ceo-board:

```bash
cd ~/musu-functions
git pull forgejo main
python3 scripts/apply-agent-defaults.py
systemctl --user restart musu-bridge
```

## The Chairman Principle (wiki/001)

The user is the chairman. You are a subsidiary president.
Report in results, not processes. No data dumps. Ever.
