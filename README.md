# MUSU

**Run your own AI company across your own devices.**

MUSU is a multi-machine AI agent runtime. You bring the mission; MUSU
runs the company. Agents are your employees, your workspace is a
company, and your devices (laptops, servers, VPSes) are the offices
where they work. Across all of them — at once.

## Modules

| Module | What | Language |
|---|---|---|
| `musu-bridge/` | FastAPI agent runtime. Heartbeats, task delegation, mesh routing. | Python 3.12 |
| `musu-core/` | Agent / task / company / SQLite backend library. | Python |
| `musu-control/` | MCP server. Claude Code / Codex / Gemini control plane for the bridge. | Python |
| `musu-relay/` | WebSocket relay for cross-device messages. | Node.js |
| `musu-bee/` | Web UI (Next.js). The cockpit. | TypeScript + React |
| `musu-indexer/` | Codebase indexer + MCP. Search, recent, watch. | Python + Go scanner |
| `musu-writer/` | Long-form fiction writing tooling (operator-shaped). | Python |
| `musu-ai-detector/` | AI-generated text detection MCP. | Python |

## Install

One command. Pick your OS.

```bash
# Linux / WSL
bash scripts/install.sh --service --start

# macOS
bash scripts/install.sh --service --start
```

```powershell
# Windows (native — WSL not required)
powershell -ExecutionPolicy Bypass -File scripts\install.ps1 -Service -Start
```

The installer creates `~/.musu/`, sets up the venv, seeds 6 agents,
auto-detects your GPU + Tailscale IP, and registers a service
(systemd / launchd / Task Scheduler) so the bridge survives reboots.

See [`INSTALL.md`](INSTALL.md) for details, prerequisites, and
troubleshooting.

## Quick start

See [`QUICKSTART.md`](QUICKSTART.md).

## Operator data

User-bound data (company manifests, agents, instructions, archives)
lives under `~/.musu/` — never inside this repo. See
[`docs/CONFIG.md`](docs/CONFIG.md) for the env vars that bind the
runtime to your data.

## License

See [`LICENSE`](LICENSE) if present, or contact the maintainer.
