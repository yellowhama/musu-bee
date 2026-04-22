# MUSU Manual

> AI team runtime that runs on your machines.
> Your AI companies build software, research topics, and manage projects autonomously.

---

## What is MUSU?

MUSU runs AI agent teams on your local devices. Each device has a CEO that manages projects through team leads, engineers, and QA agents. Multiple devices share work through a mesh network.

```
Your Device
  └─ musu-bridge (:8070)
       ├─ CEO — manages all projects, delegates to team leads
       ├─ Team Lead — runs one project, delegates to engineers
       ├─ Engineer (Gemini) — writes code, runs tests
       ├─ QA (Claude) — reviews and scores work
       └─ Node Manager — reports device health

Connected to:
  ├─ Other devices via Tailscale mesh
  ├─ Forgejo (local Git server) for code sharing
  ├─ musu.pro for remote access
  └─ #ceo-board for inter-device coordination
```

---

## Quick Start (5 minutes)

See [ONBOARDING.md](ONBOARDING.md) for full setup.

```bash
git clone https://github.com/yellowhama/musu-bee.git ~/musu-functions
cd ~/musu-functions
# Install deps, configure .env, seed agents, start bridge
# Details in ONBOARDING.md
```

---

## Daily Operations

### Check if everything is working

```bash
curl http://localhost:8070/health
# {"status":"ok"}
```

### Check success rate

```bash
curl http://localhost:8070/api/stats/success-rate?days=1
# Shows: done/failed/running counts + success percentage
```

### See what the CEO is doing

```bash
# Recent CEO activity
sqlite3 ~/.musu/musu.db "SELECT status, substr(output,1,100), created_at FROM route_executions WHERE channel='ceo' ORDER BY created_at DESC LIMIT 3;"
```

### Trigger CEO heartbeat manually

```bash
curl -X POST http://localhost:8070/api/agents/{CEO_ID}/heartbeat/invoke \
  -H "Authorization: Bearer local-dev-token-change-in-prod" \
  -H "Content-Type: application/json" -d '{}'
```

### Give feedback (as chairman)

```bash
curl -X POST http://localhost:8070/api/feedback \
  -H "Authorization: Bearer local-dev-token-change-in-prod" \
  -H "Content-Type: application/json" \
  -d '{"title": "Fix the login page", "type": "bug"}'
# Creates an issue → CEO picks it up on next heartbeat
```

---

## Multi-Device Operations

### Update a remote node

```bash
curl -X POST http://{REMOTE_IP}:8070/api/system/update \
  -H "Authorization: Bearer local-dev-token-change-in-prod"
# Runs git pull + apply-agent-defaults.py + restart if needed
```

### Post to CEO board (group chat)

```bash
curl -X POST http://localhost:8070/api/groups/ceo-board/messages \
  -H "Authorization: Bearer local-dev-token-change-in-prod" \
  -H "Content-Type: application/json" \
  -d '{"text": "All nodes: update to latest", "sender_id": "chairman"}'
```

### Read CEO board messages

```bash
curl http://localhost:8070/api/groups/ceo-board/messages?limit=5 \
  -H "Authorization: Bearer local-dev-token-change-in-prod"
```

### Change model distribution (all nodes)

Edit `.musu/agent-defaults.json`, then:
```bash
git add .musu/agent-defaults.json && git commit -m "update models" && git push
# Then remote-update each node:
curl -X POST http://{NODE_IP}:8070/api/system/update \
  -H "Authorization: Bearer local-dev-token-change-in-prod"
```

---

## Company (Project) Management

### Create a new project

```bash
curl -X POST http://localhost:8070/api/companies \
  -H "Authorization: Bearer local-dev-token-change-in-prod" \
  -H "Content-Type: application/json" \
  -d '{"name": "My App", "template_key": "dev-team", "purpose": "Build a web app"}'
# Creates company + team lead + engineer + planner + qa
```

Templates: `dev-team`, `content-team`, `research-team`

### Get project briefing (Chairman Principle)

```bash
curl http://localhost:8070/api/companies/{ID}/briefing \
  -H "Authorization: Bearer local-dev-token-change-in-prod"
# Returns: name, purpose, status, summary, blockers, recent wins
```

### Activate/Deactivate a project

```bash
curl -X POST http://localhost:8070/api/companies/{ID}/activate
curl -X POST http://localhost:8070/api/companies/{ID}/deactivate
```

### Kick CEO to work on a project

```bash
curl -X POST http://localhost:8070/api/companies/{ID}/run \
  -H "Authorization: Bearer local-dev-token-change-in-prod"
```

---

## Agent Management

### List agents

```bash
curl http://localhost:8070/api/agents \
  -H "Authorization: Bearer local-dev-token-change-in-prod"
```

### Pause/Resume an agent

```bash
curl -X POST http://localhost:8070/api/agents/{ID}/pause
curl -X POST http://localhost:8070/api/agents/{ID}/resume
```

### Update agent model

```bash
curl -X PATCH http://localhost:8070/api/agents/{ID} \
  -H "Content-Type: application/json" \
  -d '{"model": "gemini-2.5-flash"}'
```

### Model distribution

| Model | Agents | Why |
|-------|--------|-----|
| Claude | CEO, CTO, QA | Judgment, evaluation |
| Gemini | Engineer, Planner, Team Lead, Worker | Speed, volume |
| Codex | CoS, VP, Node Manager | Simple tasks |

Auto-fallback: Claude → Gemini → Codex (if rate limited)

---

## Task Delegation

### Delegate a task

```bash
curl -X POST http://localhost:8070/api/tasks/delegate \
  -H "Authorization: Bearer local-dev-token-change-in-prod" \
  -H "Content-Type: application/json" \
  -d '{"channel": "engineer", "text": "Fix the login bug in auth.py line 45. pytest tests/test_auth.py should pass."}'
# Returns: {"task_id": "..."}
```

### Poll task status

```bash
curl http://localhost:8070/api/tasks/{TASK_ID} \
  -H "Authorization: Bearer local-dev-token-change-in-prod"
# Returns: {status: "done"/"running"/"failed", summary: "..."}
```

---

## Issues & Goals

### Create an issue

```bash
curl -X POST http://localhost:8070/api/companies/{CID}/issues \
  -H "Content-Type: application/json" \
  -d '{"title": "Login page broken", "priority": "high"}'
```

### Create a goal

```bash
curl -X POST http://localhost:8070/api/companies/{CID}/goals \
  -H "Content-Type: application/json" \
  -d '{"title": "Ship v2.0 by end of month"}'
```

---

## Knowledge Base (Wiki)

### Search wiki

```bash
curl http://localhost:8070/api/wiki/search?q=authentication
```

### Read a page

```bash
curl http://localhost:8070/api/wiki/page/001_CHAIRMAN_PRINCIPLE
```

### Write a page

```bash
curl -X POST http://localhost:8070/api/wiki/page/my-notes \
  -H "Content-Type: application/json" \
  -d '{"content": "# My Notes\n\nSome content here."}'
```

---

## Troubleshooting

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
  -H "Authorization: Bearer local-dev-token-change-in-prod"
```

### High failure rate

```bash
curl http://localhost:8070/api/stats/success-rate?days=1
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
| BRIDGE_HOST | 0.0.0.0 | Bind address |
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
musu-bridge (Python/FastAPI)     — API server, agent dispatch
musu-core (Python library)       — DB, router, QA loop, adapters
musu-control (MCP server)        — 50+ tools for AI agents
musu-indexer (MCP server)        — code search, session management
musu-bee (Next.js/Tauri)         — desktop UI
musu-connects (Rust/QUIC)        — P2P mesh transport
Forgejo                          — local Git server for code sharing
```

---

## The Chairman Principle (wiki/001)

**The #1 rule for everything.**

You are a subsidiary president. The user is the chairman.
- 3-second briefing: what, how, what needs attention
- Results, not processes
- No data dumps, no technical jargon
- Handle everything yourself, report outcomes only
