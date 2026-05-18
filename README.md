# MUSU

**Run your own AI company across your own devices.**

MUSU is a multi-machine AI agent runtime. You bring the mission; MUSU
runs the company. Agents are your employees, your workspace is a
company, and your devices (laptops, servers, VPSes) are the offices
where they work. Across all of them — at once.

## What MUSU is (and is not)

- **MUSU is the OS that runs AI companies** — a long-lived agent
  runtime with CEO / Team Lead / Engineer / QA roles, a SQLite-backed
  task router, and a multi-device mesh.
- **Each project you want to build becomes a MUSU "company"**, not a
  feature of MUSU itself. Building a Land-OS analyzer, a webcomic
  editor, a B2B SaaS? That's a `company` row plus a team of agents
  *inside* MUSU. MUSU itself doesn't know about your domain.
- **Agents are your employees.** They execute via Claude / Gemini /
  Codex CLI on your devices. The CEO heartbeat drives them through
  issues, goals, and a QA loop. You stay the chairman.

If you're another AI reading this and trying to figure out where to
put your work: you almost certainly want to **create a new company**
(see "Create your first company" below), not modify MUSU itself.

## Modules

| Module | What | Language |
|---|---|---|
| `musu-bridge/` | FastAPI agent runtime. Heartbeats, task delegation, mesh routing. | Python 3.12 |
| `musu-core/` | Agent / task / company / SQLite backend library. | Python |
| `musu-control/` | MCP server. Claude Code / Codex / Gemini control plane for the bridge. | Python |
| `musu-relay/` | WebRTC signaling rendezvous for cross-PC mesh handshake (V23.4+; replaced legacy WebSocket relay). | Node.js |
| `musu-bee/` | Web UI (Next.js). The cockpit. | TypeScript + React |
| `musu-indexer/` | Codebase indexer + MCP. Search, recent, watch. | Python + Go scanner |
| `musu-writer/` | Long-form fiction writing tooling (operator-shaped). | Python |
| `musu-ai-detector/` | AI-generated text detection MCP. | Python |

## Install

One command. Pick your OS.

```bash
# Linux / WSL / macOS
bash scripts/install.sh --service --start
```

```powershell
# Windows (native — WSL not required)
powershell -ExecutionPolicy Bypass -File scripts\install.ps1 -Service -Start
```

The installer creates `~/.musu/`, generates `MUSU_BRIDGE_TOKEN`,
sets up the venv, seeds the system-level agent team, auto-detects
your GPU + Tailscale IP, and registers a service (systemd / launchd
/ Task Scheduler) so the bridge survives reboots.

See [`INSTALL.md`](INSTALL.md) for prerequisites, the per-module
manual path, and troubleshooting.

## Create your first company

After install, export the token once per shell:

```bash
export MUSU_BRIDGE_TOKEN=$(grep '^MUSU_BRIDGE_TOKEN=' ~/.musu/bridge.env | cut -d= -f2)
```

Then the minimum loop is three API calls — full reference in
[`docs/MANUAL.md`](docs/MANUAL.md) §"Company (Project) Management":

```bash
# 1. Create the company (auto-seeds Team Lead + Planner + Engineer + QA)
curl -X POST http://localhost:8070/api/companies \
  -H "Authorization: Bearer $MUSU_BRIDGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"My Project","template_key":"dev-team","purpose":"What this company exists to build"}'
# → returns {"company": {"id": "...", ...}, "agents": [...], "governance": {...}}
# Extract id with: ... | jq -r '.company.id'

# 2. Activate it
curl -X POST http://localhost:8070/api/companies/<ID>/activate \
  -H "Authorization: Bearer $MUSU_BRIDGE_TOKEN"

# 3. Kick the CEO to start work
curl -X POST http://localhost:8070/api/companies/<ID>/run \
  -H "Authorization: Bearer $MUSU_BRIDGE_TOKEN"
```

Templates: `dev-team` (most common), `content-team`, `research-team`,
`writer-studio`. Add goals + issues to the company and the CEO will
work through them — see [`docs/MANUAL.md`](docs/MANUAL.md) for the
full surface area (delegation, briefings, wiki, mesh, vault).

## Quick start

[`QUICKSTART.md`](QUICKSTART.md) walks you from `~/.musu/` empty to a
first agent task in under 10 minutes (한국어 OK). Read
[`docs/GETTING_STARTED.md`](docs/GETTING_STARTED.md) for a longer
per-API walkthrough and [`docs/MANUAL.md`](docs/MANUAL.md) for the
full feature reference.

## Operator data

User-bound data (company manifests, agents, instructions, archives)
lives under `~/.musu/` — never inside this repo. See
[`docs/CONFIG.md`](docs/CONFIG.md) for the env vars that bind the
runtime to your data.

## License

See [`LICENSE`](LICENSE) if present, or contact the maintainer.
