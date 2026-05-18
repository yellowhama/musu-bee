# Getting Started with MUSU

> 5-minute guide. From zero to your first AI agent task.

---

## Prerequisites

- **Python 3.12+**
- **One AI CLI installed**: [Claude Code](https://docs.anthropic.com/en/docs/claude-code), [Gemini CLI](https://github.com/google-gemini/gemini-cli), or [Codex CLI](https://github.com/openai/codex)
- **Linux** (Ubuntu/Debian recommended) or WSL2

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

> **Status note (2026-05-18)**: `scripts/install.sh` is not yet checked
> in (V23.5 Tooling sub-WS). Until it lands, follow the per-module
> manual install in [`../INSTALL.md`](../INSTALL.md) §"Per-module
> manual install".

What this does:
- Creates `~/.musu/` (config, DB, tokens)
- Installs `musu-core` and `musu-bridge` into a local venv
- Auto-detects your GPU and network identity
- Seeds a default agent team (CEO, CTO, Engineer, QA)
- Registers and starts `musu-bridge` as a systemd user service

---

## 2. Verify

```bash
curl http://localhost:8070/health
```

Expected response:

```json
{"status":"ok","bridge":"running","version":"..."}
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

Or delegate to a specific role:

```bash
curl -X POST http://localhost:8070/api/route \
  -H "Content-Type: application/json" \
  -d '{"channel":"worker","sender_id":"me","text":"Analyze the architecture of this project and write a summary.","role":"cto"}'
```

---

## 4. Add Another Machine (Multi-Node Mesh)

MUSU can distribute tasks across machines. Each machine runs its own bridge. To register a remote node:

```bash
curl -X POST http://localhost:8070/api/nodes/add \
  -H "Content-Type: application/json" \
  -d '{
    "name": "gpu-server",
    "url": "http://192.168.1.50:8070",
    "gpu": "RTX 4090",
    "os": "linux"
  }'
```

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

---

## 6. Web Dashboard (Optional)

If Node.js is installed, the installer also builds `musu-bee` (the web UI):

```
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

Edit `bridge.env` to set your relay token for musu.pro connectivity:

```bash
# ~/.musu/bridge.env
MUSU_TOKEN=your-relay-token-here
```

---

## Next Steps

- [MANUAL.md](MANUAL.md) -- full feature reference (agents, delegation, QA loop, Ralph autonomous mode)
- [ONBOARDING.md](ONBOARDING.md) -- detailed node setup with Tailscale mesh
- [PRODUCTION.md](PRODUCTION.md) -- production deployment guide
- [QUICKSTART.md](../QUICKSTART.md) -- CLI-based quick start with `musu` commands
