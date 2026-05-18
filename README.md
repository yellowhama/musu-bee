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
  feature of MUSU itself. If you're building a Land-OS analyzer or a
  webcomic editor or a B2B SaaS, that's a `company` row plus a team
  of agents inside MUSU. MUSU itself doesn't know about your domain.
- **Agents are your employees.** They execute via Claude / Gemini /
  Codex CLI on your devices. The CEO heartbeat drives them through
  issues, goals, and a QA loop. You stay the chairman.

If you're another AI reading this and trying to figure out where to
put your work: you almost certainly want to **create a new company**
(see "Create your first company" below), not modify MUSU itself.

## Create your first company

The minimum loop is three API calls — full reference in
[`docs/MANUAL.md`](docs/MANUAL.md) §"Company (Project) Management":

```bash
# 1. Create the company (auto-seeds Team Lead + Engineer + Planner + QA)
curl -X POST http://localhost:8070/api/companies \
  -H "Authorization: Bearer $MUSU_BRIDGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"My Project","template_key":"dev-team","purpose":"What this company exists to build"}'
# → returns {"id": "...", ...}

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

Self-host install is documented in [`INSTALL.md`](INSTALL.md): prerequisites
per OS, the per-module manual install path (`musu-bridge`, `musu-bee`,
`musu-relay`), service registration, and troubleshooting.

> **Note**: the convenience installer scripts referenced from `INSTALL.md`
> (`scripts/install.sh`, `scripts/install.ps1`) are not yet checked in — they
> are tracked as a V23.5 Tooling sub-WS. Until then, follow the per-module
> manual install in [`INSTALL.md`](INSTALL.md) §"Per-module manual install".

## Quick start

[`QUICKSTART.md`](QUICKSTART.md) walks you from `~/.musu/` empty to a first
agent task in under 10 minutes. Read [`docs/GETTING_STARTED.md`](docs/GETTING_STARTED.md)
for a longer per-API walkthrough and [`docs/MANUAL.md`](docs/MANUAL.md) for
the full feature reference.

## Operator data

User-bound data (company manifests, agents, instructions, archives)
lives under `~/.musu/` — never inside this repo. See
[`docs/CONFIG.md`](docs/CONFIG.md) for the env vars that bind the
runtime to your data.

## License

See [`LICENSE`](LICENSE) if present, or contact the maintainer.
