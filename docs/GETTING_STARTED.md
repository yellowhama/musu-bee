# Getting Started with MUSU

> 5-minute guide. From zero to your first AI agent task.

---

## Prerequisites

- **Python 3.12+**
- **One AI CLI installed**: [Claude Code](https://docs.anthropic.com/en/docs/claude-code), [Gemini CLI](https://github.com/google-gemini/gemini-cli), or [Codex CLI](https://github.com/openai/codex)
- **Linux** (Ubuntu/Debian) / **macOS** / **Windows** (native or WSL2). See [`../INSTALL.md`](../INSTALL.md) for per-OS prereqs.

Verify:

```bash
python3 --version   # 3.12+
claude --version     # or: gemini --version / codex --version
```

---

## 1. Install

Clone and run the installer. One command does everything: creates a virtualenv, generates auth tokens, seeds agents, and registers a systemd service.

```bash
git clone https://github.com/yellowhama/musu-bee.git
cd musu-bee
bash scripts/install.sh --service --start
```

Windows users: `powershell -ExecutionPolicy Bypass -File scripts\install.ps1 -Service -Start`.

Windows distribution note:
- The command above describes the **current direct-download/operator path**.
- MUSU is also being prepared for a **Store/MSIX packaged Windows path**.
- Do not assume the Store build will reuse `install.ps1`, `~/.musu/bin`, Task Scheduler registration, or MUSU-managed self-update.
- Reference: [`STORE_MSIX_AUDIT_2026_05_27.md`](STORE_MSIX_AUDIT_2026_05_27.md), [`PRODUCT_CHARTER/WINDOWS_DISTRIBUTION_PIVOT_2026-05-27.md`](PRODUCT_CHARTER/WINDOWS_DISTRIBUTION_PIVOT_2026-05-27.md)

What this does:
- Creates `~/.musu/` (config, DB, tokens)
- Installs `musu-core` and `musu-bridge` into a local venv
- Auto-detects your GPU and network identity
- Seeds the system-level 6-agent team (CEO, CTO, Engineer, CoS, QA, Worker — see `seed_agents.py`)
- Registers and starts `musu-bridge` as a systemd user service

---

## 2. Verify

```bash
curl http://localhost:8070/health
```

Expected response (per `server.py` /health):

```json
{
  "status": "ok",
  "version": "...",
  "relay": {"connected": false, "reconnect_count": 0},
  "worker": false,
  "active_tasks": 0,
  "db_size_mb": 0.1,
  "disk_free_pct": 42.0
}
```

If it fails, check logs:

```bash
journalctl --user -u musu-bridge -n 30
```

---

## 3. Your First Task

Route a task to the worker channel. The bridge picks an available agent and executes it.

```bash
curl -X POST http://localhost:8070/api/route \
  -H "Content-Type: application/json" \
  -d '{"channel":"worker","sender_id":"me","text":"What is 2+2?"}'
```

The response includes a `task_id`. Check its status:

```bash
curl http://localhost:8070/api/tasks/<task_id>
```

Or route to a specific channel (the channel name IS the role selector
— `cto`, `ceo`, `engineer`, etc. — there is no separate `role` field
on `RouteRequest`):

```bash
curl -X POST http://localhost:8070/api/route \
  -H "Content-Type: application/json" \
  -d '{"channel":"cto","sender_id":"me","text":"Analyze the architecture of this project and write a summary."}'
```

---

## 4. Add Another Machine (Multi-Node Mesh)

MUSU can distribute tasks across machines. Each machine runs its own bridge. To register a remote node:

```bash
curl -X POST http://localhost:8070/api/nodes/add \
  -H "Authorization: Bearer $MUSU_BRIDGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "gpu-server",
    "url": "http://192.168.1.50:8070"
  }'
```

`NodeAddRequest` accepts `name`, plus either `url` or `tailscale_ip`,
plus optional `agents` (list of agent names to assign). GPU / OS
metadata is NOT a request field — it lives in `~/.musu/nodes.toml` on
the destination machine (see [`CONFIG.md`](CONFIG.md) §Nodes).

Verify the mesh:

```bash
curl http://localhost:8070/api/nodes
```

The bridge will route GPU-heavy tasks to nodes with GPUs and balance load across all healthy nodes.

---

## 5. Update All Nodes

Push updates to every node in the mesh with one call:

```bash
curl -X POST http://localhost:8070/api/system/update-all
```

This triggers a `git pull` + dependency reinstall on each registered node.

Store/MSIX note:
- This update flow is for direct-download nodes.
- Packaged Windows builds must use Windows / Microsoft Store-managed updates instead.
- In `store-msix` mode, MUSU disables its own self-update path.

---

## 6. Workspace Web Dashboard (Developer-Only, Optional)

The installed MUSU Desktop app does not require `localhost:3001`. It runs the
local runtime directly on this machine. Use MUSU Desktop for local execution and
use `https://musu.pro` as the remote work-order/control-plane surface when it is
configured.

Only use the workspace Next.js dashboard while developing `musu-bee` locally. If
you have not started that dev server, `http://localhost:3001` returning
connection refused is expected.

```
cd musu-bee
npm run dev

http://localhost:3001/app            Main dashboard
http://localhost:3001/app/dashboard  Task overview
http://localhost:3001/app/wiki       Wiki & research
```

---

## Configuration

All config lives in `~/.musu/`:

| File | Purpose |
|------|---------|
| `bridge.env` | Auth tokens, host binding, feature flags |
| `nodes.toml` | Mesh topology (self identity + remote nodes) |
| `db/` | SQLite databases (tasks, agents, memory) |

Edit `bridge.env` to set environment variables. The token (auto-generated
by `install.sh`) is the main one you'll need:

```bash
# ~/.musu/bridge.env
MUSU_BRIDGE_TOKEN=<32-char hex>      # required, generated by installer
BRIDGE_HOST=127.0.0.1                 # default; set 0.0.0.0 for LAN
BRIDGE_PORT=8070                       # default
```

LAN clients ALWAYS require the bearer token. Localhost requests require
the bearer token by default. Set `MUSU_BRIDGE_LOCALHOST_AUTH=0` only for
explicit local development bypass on a trusted single-user machine. Full env var reference:
[CONFIG.md](CONFIG.md).

---

## Next Steps

- [MANUAL.md](MANUAL.md) -- full feature reference (agents, delegation, QA loop, Ralph autonomous mode)
- [ONBOARDING.md](ONBOARDING.md) -- detailed node setup with Tailscale mesh
- [PRODUCTION.md](PRODUCTION.md) -- production deployment guide
- [QUICKSTART.md](../QUICKSTART.md) -- shorter "first company" walkthrough (한국어 OK)
