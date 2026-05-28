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
- **Universal Machine Binding.** MUSU binds your devices together
  without heavy virtualization or VPNs. View and control remote screens
  via WebRTC (Remote KVM), stream remote files natively via HTTP range proxies,
  sync your clipboard across your fleet in real-time, and execute
  commands seamlessly across nodes using the built-in MCP mesh routing.

If you're another AI reading this and trying to figure out where to
put your work: you almost certainly want to **create a new company**
(see "Create your first company" below), not modify MUSU itself.

## Modules

V24 migrated Layer 1 (machines) from Python to a single Rust binary (`musu`). The 5 Python modules below are retained as a R10-pending deletion target so operators can audit the migration before approving bulk delete. See [V24 closure §4](docs/V24_CLOSURE_2026_05_21.html) for the R10 runbook.

| Module | What | Language | Status |
|---|---|---|---|
| `musu bridge` | Bridge subcommand (tokio + axum). Heartbeats, task delegation, mesh routing. | Rust | Active (Rust subcommand) |
| `musu core` | Core subcommand. Companies / agents / audit / adapters. Schema v1. | Rust | Active (Rust subcommand) |
| `musu control` | MCP subcommand (stdio JSON-RPC, `rmcp` crate). 14 tools. | Rust | Active (Rust subcommand) |
| `musu indexer` | Indexer subcommand. Per-workspace SQLite FTS5 + scanner. | Rust | Active (Rust subcommand) |
| `musu writer` | Writer subcommand. Agent task execution + SSE stream. | Rust | Active (Rust subcommand) |
| `musu-relay/` | WebRTC signaling rendezvous for cross-PC mesh handshake (V23.4+; replaced legacy WebSocket relay). | Node.js | Active |
| `musu-bee/` | Web UI (Next.js). The cockpit. | TypeScript + React | Active |
| `musu-ai-detector/` | AI-generated text detection MCP. | Python | Active |
| `musu-bridge/` | (legacy) FastAPI agent runtime. Heartbeats, task delegation, mesh routing. | Python 3.12 | Deprecated (R10-pending) |
| `musu-core/` | (legacy) Agent / task / company / SQLite backend library. | Python | Deprecated (R10-pending) |
| `musu-control/` | (legacy) MCP server. Claude Code / Codex / Gemini control plane for the bridge. | Python | Deprecated (R10-pending) |
| `musu-indexer/` | (legacy) Codebase indexer + MCP. Search, recent, watch. | Python + Go scanner | Deprecated (R10-pending) |
| `musu-writer/` | (legacy) Long-form fiction writing tooling (operator-shaped). | Python | Deprecated (R10-pending) |

## Install

One command. Pick your OS.

```bash
# Linux / macOS
curl -sSf https://raw.githubusercontent.com/yellowhama/musu-bee/main/install.sh | bash
```

```powershell
# Windows
iwr https://raw.githubusercontent.com/yellowhama/musu-bee/main/install.ps1 -useb | iex
```

The installer downloads the pre-built `musu` and `musud` binaries, registers a background service so the bridge survives reboots, and adds `~/.musu/bin` to your PATH.

### Windows distribution direction

Windows now has three intended distribution modes:

- **Current operator path**: direct-download bootstrap via `install.ps1`
- **Packaged local validation path**: MSIX sideload with **manual** `musu bridge`
- **Target product path**: Microsoft Store review with restricted-capability **ImmediateRegistration** auto-start

The packaged Windows paths are not intended to reuse the full direct-download install model. In both packaged paths, Windows owns installation and updates, and MUSU must not depend on binary self-copy, PATH mutation, Task Scheduler registration, or GitHub self-update. Local sideload is currently a manual-bridge contract; Windows auto-start is a separate Store-reviewed deployment model.

Current state:

- **local sideload / manual bridge**: validated in-repo
- **Store-reviewed auto-start**: artifact and submission bundle ready, external Microsoft review still pending

See:

- [Store/MSIX audit](docs/STORE_MSIX_AUDIT_2026_05_27.md)
- [Store/MSIX execution plan](docs/STORE_MSIX_EXECUTION_PLAN_2026_05_27.md)
- [Store/MSIX packaging guide](docs/STORE_MSIX_PACKAGING_GUIDE_2026_05_27.md)
- [Store/MSIX restricted capability submission checklist](docs/STORE_MSIX_RESTRICTED_CAPABILITY_SUBMISSION_CHECKLIST_2026_05_27.md)
- [Store/MSIX approval status ledger](docs/STORE_MSIX_APPROVAL_STATUS_2026_05_27.md)
- [Store/MSIX next steps](docs/STORE_MSIX_NEXT_STEPS_2026_05_27.md)
- [Windows distribution pivot](docs/PRODUCT_CHARTER/WINDOWS_DISTRIBUTION_PIVOT_2026-05-27.md)

### Connect your account

Once installed, link this machine to your fleet (V27 Account Mesh):

```bash
musu login
```

This will give you an 8-character code to authorize in your browser. Upon success, your node is securely registered and instantly visible in the musu.pro dashboard.

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

## Documentation map

Three primary docs cover all audiences:

- **[`QUICKSTART.md`](QUICKSTART.md)** — 10-minute path from fresh
  install to a running first company. 한국어 OK. Start here as a
  new human user OR as an AI assistant picking up the repo.
- **[`INSTALL.md`](INSTALL.md)** — per-OS install reference,
  prerequisites, per-module manual install, service management,
  troubleshooting. Read this when QUICKSTART's one-command path
  fails or you want fine-grained control.
- **[`docs/MANUAL.md`](docs/MANUAL.md)** — full API + concept
  reference. Company management, agent management, task delegation,
  channels, vault, wiki, mesh, the Chairman Principle. Read this
  once the bridge is running and you need a feature.

Secondary docs (read when needed, not on first pass):
[`docs/CONFIG.md`](docs/CONFIG.md) (env vars),
[`docs/ONBOARDING.md`](docs/ONBOARDING.md) (adding a node to an
existing mesh), [`docs/GETTING_STARTED.md`](docs/GETTING_STARTED.md)
(longer per-API walkthrough — overlaps with QUICKSTART).

## Operator data

User-bound data (company manifests, agents, instructions, archives)
lives under `~/.musu/` — never inside this repo. See
[`docs/CONFIG.md`](docs/CONFIG.md) for the env vars that bind the
runtime to your data.

## License

See [`LICENSE`](LICENSE) if present, or contact the maintainer.
