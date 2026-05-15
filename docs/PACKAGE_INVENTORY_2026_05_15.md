# musu Package Inventory (2026-05-15)

**Status**: as-measured snapshot, not aspirational
**Source**: `F:\workspace\musu-bee\` monorepo at HEAD (post v21.F merge)
**Method**: filesystem listing + manifest reads + first README/Cargo.toml
lines per package. No subagent summaries — direct inspection only.

This document supersedes `wiki/347` package roster for inventory purposes
(wiki/347 is a v20.ARCH-era roadmap; this is what actually exists today).

---

## 1. Twelve packages at a glance

| # | Package | Lang | One-line role | Path |
|---|---------|------|---------------|------|
| 1 | **musu-bridge** | Python (FastAPI) | User-device control plane. 50+ modules: axis/watch/relay/scheduler/heartbeat routers, A2A mesh, audit, vault | `musu-bridge/` |
| 2 | **musu-core** | Python | Shared data/util library that bridge depends on | `musu-core/src/musu_core/` |
| 3 | **musu-control** | Python (MCP) | MCP server: Claude Code → musu-bridge. Installable via `uvx` | `musu-control/` |
| 4 | **musu-indexer** | Python (MCP) | MCP server: workspace search / recent / PTY-spy / SQLite index | `musu-indexer/` |
| 5 | **musu-ai-detector** | Python (MCP) | MCP server: extracts AI-text statistical features (KO: KatFishNet, EN: ZipPy). Does NOT judge — agent does | `musu-ai-detector/` |
| 6 | **musu-worker** | Python (FastAPI) | Remote-execution worker, port 9700. `/execute/process` is an intentional RCE endpoint | `musu-worker/` |
| 7 | **musu-supervisor** | Rust (Cargo workspace) | Agent spawn + isolation. `musud` daemon + `musu` CLI + isolation crates for Linux/Windows/macOS | `musu-supervisor/` |
| 8 | **musu-port** | Rust | Port → ingress abstraction control plane (alias / promote / ignore) | `musu-port/` |
| 9 | **musu-relay** | TypeScript (Node) | Cloud relay tunnel broker (musu-bridge ↔ musu.pro). Deployed on Railway | `musu-relay/` |
| 10 | **musu-bee** | Next.js | Web UI. Paddle billing, axis views (`/c/:company`, `/m/:machine`), Playwright E2E | `musu-bee/` |
| 11 | **musu-writer** | Python | Blog draft generator with Editor-review workflow | `musu-writer/` |
| 12 | **musu-plugin** | Manifest-only | Claude Code plugin bundle: manifest + .mcp.json + commands/agents/skills/hooks | `musu-plugin/` |

---

## 2. Per-package detail

### 2.1 musu-bridge — the control plane

Single package, 50+ Python modules. Grouped by functional area:

| Group | Modules |
|-------|---------|
| **Auth / security** | `csrf_guard.py`, `hostname_guard.py`, `input_guard.py`, `ws_guard.py`, `vault.py` |
| **Company / machine model** | `company_loader.py`, `company_templates.py`, `bridge_models.py`, `node_identity.py`, `seed_agents.py`, `seed_bw_agents.py`, `writer_company.py` |
| **Axis routing (v21.E/F)** | `axis_routes.py`, `dispatch_routes.py`, `runtime_routes.py`, `screen_routes.py`, `system_routes.py`, `watch_routes.py`, `wiki_routes.py` |
| **Watch / SSE (v21.B)** | `watch_routes.py`, `sync_engine.py`, `watchdog.py` |
| **Heartbeat / health** | `heartbeat_scheduler.py`, `system_stats.py`, `diagnostics.py`, `monitoring/` |
| **A2A / mesh** | `a2a.py`, `mesh_router.py`, `peer_cache.py`, `discovery.py` |
| **Relay client** | `relay_client.py`, `relay_circuit_breaker.py`, `channel_circuit_breaker.py` |
| **Research** | `research.py`, `research_agent.py` |
| **Audit / metrics** | `audit.py`, `metrics.py` |
| **OpenAI compat shim** | `openai_compat.py` |
| **Screen capture / VNC** | `screen_capture.py`, `screen_vnc.py` |
| **Wiki ingest** | `wiki_ingest.py` |
| **Wake-on-LAN** | `wol.py` |
| **Sandbox bash** | `sandbox_bash.py` |
| **Registry** | `registry.py` |
| **CLI entrypoints** | `cli.py`, `__main__.py` |

Plus internal packages: `controllers/` (v21.A reconciler/workqueue/sources/handlers/manager/builder), `scheduler/` (v21.C request/capacity/filter/score/binder/loop), `reconcilers/` (v21.E CEO + Machine), `adapters/` (ScheduledProcess + Remote deprecated).

### 2.2 musu-core
Shared library at `musu-core/src/musu_core/`. Imported by bridge. Stable.

### 2.3 musu-control (MCP server)
Wired into Claude Code via `~/.claude/mcp-servers.json`. Env vars:
- `MUSU_BRIDGE_URL` (e.g. `http://localhost:8070`)
- `MUSU_BRIDGE_TOKEN`
- `PAPERCLIP_COMPANY_ID`

Install: `uvx --from git+https://github.com/yellowhama/musu-bee#subdirectory=musu-control musu-control`

### 2.4 musu-indexer (MCP server)
Subcommands:
- `sync` — incremental file scan + SQLite index
- `watch` — auto-ingest daemon
- `search` — keyword + tag query
- `recent` — recently changed files
- `spy` / `session` — PTY / chat logger
- `mcp` — MCP server (stdio or `--http` shared singleton)

Pre-built scanner binaries ship in releases.

### 2.5 musu-ai-detector (MCP server)
Does NOT make a verdict. Extracts statistical features, agent decides.
Tools:
- `detect_ai(text)` — features only (KO: KatFishNet morpheme/comma/POS n-gram diversity; EN: ZipPy compression-ratio)
- `detect_ai_report(run_id)` — fetch prior result
- `detect_ai_fix(run_id, spans)` — generate polish workspace from agent-marked spans

### 2.6 musu-worker
FastAPI on port 9700. **`/execute/process` is an intentional RCE endpoint** — runs arbitrary commands with the worker's privileges.

| Env | Required | Default |
|-----|----------|---------|
| `MUSU_WORKER_TOKEN` | prod only | (none) |
| `MUSU_WORKER_HOST` | no | `0.0.0.0` |
| `MUSU_WORKER_PORT` | no | `9700` |

Emits a loud startup `WARNING` when token absent. Intended deployment: Tailscale-isolated mesh.

### 2.7 musu-supervisor (Rust workspace)

| Member | Status |
|--------|--------|
| `apps/musud` | supervisor daemon |
| `apps/musu` | CLI |
| `crates/musu-supervisor-core` | Isolation trait + shared models |
| `crates/musu-supervisor-isolation` | trait + dispatch |
| `crates/musu-supervisor-isolation-windows` | **shipped** — AppContainer + Job Object pipeline, 27 tests pass (v21.D, `V21D_WINDOWS_IMPL_2026_05_15.md`) |
| `crates/musu-supervisor-isolation-linux` | scaffold (task #296 in_progress, blocked on Linux host) |
| `crates/musu-supervisor-isolation-macos` | scaffold (task #298 in_progress, blocked on macOS host) |

### 2.8 musu-port
Port-as-ingress control plane, NOT a port viewer. Three intents:
1. Abstract port numbers into `alias` / `protocol` / `entrypoint_url`
2. Promote unmanaged local listeners into managed L4/L7 routes (discovery → promote → ignore)
3. Dynamic ops surface — operator manages "ingress surface" not "port number"

HTTP/WS exposed as alias URL; TCP/QUIC re-exposed as managed bind port.
Currently in BUILD_SPEC reproduction phase (see `musu-port/BUILD_SPEC.md`).

### 2.9 musu-relay (TypeScript)
Express + ws cloud broker. Deployed via Railway (`railway.json` + `Dockerfile`). Mediates musu-bridge ↔ musu.pro for users behind NAT.

### 2.10 musu-bee (Next.js)
Web UI. Highlights:
- Paddle billing (`PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`, `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`, `PADDLE_PRICE_ID_PRO`, `PADDLE_PRICE_ID_TEAM`)
- v21.F axis views: `/c/:company_id` Company view + `/m/:machine_id` Machine view
- SSE subscription filtered by company/machine
- Playwright E2E in `e2e/`

### 2.11 musu-writer
Blog draft generator. Output enters `status: DRAFT — awaiting Editor review` workflow. Off the critical operational path.

### 2.12 musu-plugin (manifest-only)
Claude Code plugin packaging. No runtime code.
- `.claude-plugin/plugin.json` — manifest
- `.mcp.json` — wires `musu-control` + `musu-indexer`
- Commands: `musu-status`, `musu-board`, `musu-wake`, `musu-assign`
- Agents: `musu-operator`, `musu-reviewer`
- Skills: `skills/musu-governance/SKILL.md`
- Hooks: `hooks/paperclip_guard.py`

---

## 3. Dependency topology

```
USER (Claude Code)
   │
   └─ musu-plugin (manifest bundle)
         │
         ├── MCP ──► musu-control ────────────► musu-bridge ◄── musu-core
         ├── MCP ──► musu-indexer                    │
         └── MCP ──► musu-ai-detector                │
                                                    ├── HTTP ──► musu-worker  (other machines)
                                                    ├── HTTP ──► musu-supervisor (musud + isolation)
                                                    ├── HTTP ──► musu-port (ingress)
                                                    ├── WS ────► musu-relay ──► musu.pro
                                                    └── DB ────► SQLite (single file, schema v36)

WEB UI: musu-bee (Next.js) ──HTTP+SSE──► musu-bridge
SIDE:   musu-writer (offline blog tool)
```

---

## 4. K8s analogy (frame v9, factual)

| K8s | musu |
|-----|------|
| kubelet (node agent) | musu-bridge (one per user device) |
| etcd / API server | bridge's SQLite (single-writer assumed; multi-writer is the v22 gap) |
| kube-scheduler | `musu-bridge/scheduler/*` (v21.C) |
| kube-controller-manager | `musu-bridge/controllers/*` + `reconcilers/*` (v21.A + v21.E) |
| CRI / containerd | musu-supervisor (isolated spawn) |
| kubectl | musu-plugin commands + musu-control MCP |
| Ingress controller | musu-port |
| Service mesh | musu-relay |
| Dashboard | musu-bee |
| Worker node | musu-worker |

Honest framing per `V22_K8S_GAP_ANALYSIS_2026_05_15.md` §1: this is *"K8s-correct controller pattern on single-host SQLite,"* not *"K8s on SQLite."*

---

## 5. Package status grades

| Tier | Packages | Meaning |
|------|----------|---------|
| ✅ production | musu-bridge, musu-core, musu-bee, musu-relay | Live, deployed (relay on Railway), users depend on these |
| ✅ shipped | musu-control, musu-indexer, musu-ai-detector | MCP-registrable, used by agents |
| ⚠ partial | musu-supervisor | Windows isolation complete; Linux/macOS scaffold |
| ⚠ active rewrite | musu-port | BUILD_SPEC reproduction phase |
| ⚠ utility | musu-worker | Functional but requires Tailscale-isolated network |
| 📦 packaging | musu-plugin | Manifest bundle, no code |
| 📦 side | musu-writer | Off the critical path |

---

## 6. What musu actually does (in 6 lines)

1. **Spawns and isolates AI agents locally** (bridge + supervisor)
2. **Schedules and relays agents across multiple devices** (bridge scheduler + worker + relay)
3. **Provides a control-plane callable by agent tools** (control + indexer + ai-detector MCPs)
4. **Abstracts the port/network surface** (musu-port)
5. **Exposes a web UI + billing to the user** (musu-bee)
6. **Packages it all as a Claude Code plugin** (musu-plugin)

Of the 12 packages, **bridge + supervisor + bee + relay** are the 4 real operational assets. The other 8 are tools, MCPs, packaging, or utility.

---

## 7. What is NOT in this inventory

- Wiki numbering (`wiki/347`, `wiki/349`, etc.) referenced in v21 closure docs is an abstract roadmap convention, not a filesystem path. Closure docs live in `docs/V##_*_YYYY_MM_DD.md` here.
- `_archived/` and `work/` directories at repo root contain experimental code not counted as packages.
- External clones at `F:/workspace/external/k8s-research/` (sample-controller, controller-runtime, k3s) are reference reads, not musu packages.

---

## 8. Cross-references

- v21 master plan: `wiki/347` (abstract) — see `docs/V21A_*` through `docs/V21F_CLOSURE_2026_05_15.md`
- v21.D Windows isolation: `docs/V21D_WINDOWS_IMPL_2026_05_15.md`
- v22 K8s gap analysis: `docs/V22_K8S_GAP_ANALYSIS_2026_05_15.md` (includes §7 honest self-assessment)
- Frame v9 (current architecture frame): `wiki/346` (abstract)
- Frame v10 (planned, post-v22): `wiki/35X` placeholder
