# MUSU System Architecture

> ⚠️ **STALE — READ BEFORE TRUSTING THIS DOC (flagged 2026-06-10).**
> The diagrams below describe the OLD Python 3.12 + FastAPI `musu-bridge` (:8070)
> architecture. **The backend was locked to RUST on 2026-05-20** (tokio + axum +
> sqlx); the Python stack (`musu-bridge`/`musu-core`/`musu-control`/indexer/
> writer, ~25k LOC) is a *deprecation target*, not the current design. All recent
> work (device-flow, desktop unification, bridge) lives in `musu-rs/` (Rust), NOT
> in the Python files named here. Do NOT go looking for `handlers.py` /
> FastAPI routes to extend current behavior — start from `musu-rs/src/`.
> Authoritative current sources: memory `decision-musu-backend-rust`,
> `docs/GOAL.md` (latest `v9xx` rows), and
> `docs/DESKTOP_BRIDGE_ONBOARDING_SPEC_AND_ROADMAP_2026_06_09.md` §10.
> The sections below are kept only as historical reference for the Python era.

## 1. System Overview

```
 User (CLI / MCP / Web)
        |
        v
 ┌──────────────┐     ┌──────────────┐
 │ musu-control  │────>│  musu-bridge │ :8070  (FastAPI)
 │ (MCP server)  │     │              │
 └──────────────┘     │  handlers.py │
                      │  server.py   │
                      └──────┬───────┘
                             |
              ┌──────────────┼──────────────┐
              v              v              v
        ┌──────────┐  ┌──────────┐  ┌──────────────┐
        │musu-core │  │mesh_router│  │ sync_engine  │
        │(library) │  │(peer fwd) │  │(peer pull)   │
        └────┬─────┘  └──────────┘  └──────────────┘
             |
     ┌───────┼───────┐
     v       v       v
 ┌───────┐┌───────┐┌───────┐
 │claude ││gemini ││codex  │   CLI subprocesses
 │ CLI   ││ CLI   ││ CLI   │   (adapters)
 └───────┘└───────┘└───────┘
```

Supporting services:

```
 musu-relay  :9900  — WebSocket tunnel (cross-machine relay)
 musu-bee           — Next.js web UI (local + SaaS)
 musu-indexer       — Codebase search / session management (MCP)
```

## 2. Modules

| Module | Runtime | Role |
|--------|---------|------|
| **musu-bridge** | Python 3.12 + FastAPI (:8070) | HTTP API server, agent orchestration, mesh routing |
| **musu-core** | Python library (no server) | Agent/task/DB abstraction, adapter dispatch, QA loop |
| **musu-control** | MCP server | Claude Code integration — task delegation, dashboards |
| **musu-relay** | Node.js + Express + WS (:9900) | WebSocket relay for cross-machine communication |
| **musu-bee** | Next.js 16 + React 19 | Web UI for dashboard, agent monitoring |
| **musu-indexer** | MCP server | Codebase indexing, tag search, ACP session management |

Dependency rule: `bridge → core` only. No reverse dependency.

## 3. Task Routing Flow

```
1. POST /api/route {agent, message}
        |
2. handlers.py validates instruction (quality gates)
        |
3. musu-core router resolves agent → adapter_type + config
        |
4. If agent is on a remote node:
   └─ mesh_router.forward_http() → remote bridge
        |
5. If local: adapter spawns CLI subprocess
   └─ claude --print --output-format stream-json -p "prompt"
        |
6. AdapterResult {response, usage, session_id, error_code}
        |
7. If error + retriable → try fallback_chain[0], then [1]
        |
8. Result stored in DB → returned to caller
```

## 4. Multi-Machine Mesh

Configuration: `~/.musu/nodes.toml`

```toml
[mesh]
self = "wsl-main"

[[mesh.nodes]]
name = "wsl-main"
url = "http://localhost:8070"

[[mesh.nodes]]
name = "gpu-box"
url = "http://192.168.1.50:8070"
token = "peer-secret"

[[mesh.agent_assignments]]
agent = "engineer"
node = "gpu-box"
```

**MeshRouter** (`mesh_router.py`):
- Reads `nodes.toml` at startup, resolves `agent → node` mapping
- `forward_http(agent, message)` — POST to remote node's `/api/route`
- Authenticates with per-node `token` field (Bearer header)
- Per-channel **CircuitBreaker** prevents repeated forwarding to dead nodes
- NodeInfo stores metadata: MAC (Wake-on-LAN), OS, GPU, RustDesk ID

**SyncEngine** (`sync_engine.py`):
- Pulls company records and message history from peer nodes
- Uses `MUSU_TOKEN` (account-level) for peer auth, falls back to `MUSU_BRIDGE_TOKEN`

## 5. Adapter System

Base class: `musu_core.adapters.base.BaseAdapter` (ABC)

| Adapter | CLI | Default Model |
|---------|-----|---------------|
| `claude_local` | `claude` | claude-sonnet-4-6 / claude-haiku-4-5 |
| `gemini_local` | `gemini` | gemini-2.5-pro / gemini-2.5-flash |
| `codex_local` | `codex` | gpt-5.5 |

Subprocess execution pattern (claude_local):
```
claude --print --output-format stream-json \
  --model claude-sonnet-4-6 \
  --max-turns 30 \
  -p "prompt text"
```

Key details:
- Strips `CLAUDECODE`/`CLAUDE_CODE_SESSION` env vars to avoid nesting errors
- `AdapterContext` carries: run_id, prompt, agent info, config, session_id, cwd
- `AdapterResult` returns: response text, usage summary, error_code (if failed)
- `resolve_instructions()` supports adapter-specific instruction files
  (e.g., `ceo.md` → `ceo.gemini.md` when adapter is `gemini_local`)

## 6. Fallback Chain

Each agent can define a `fallback_chain` — ordered list of alternative adapters.

```
Primary: claude_local (claude-sonnet-4-6)
   |
   fail (retriable?) ──yes──> Fallback 1: gemini_local (gemini-2.5-pro)
                                  |
                                  fail ──> Fallback 2: codex_local (gpt-5.5)
                                               |
                                               fail ──> error returned to caller
```

**Retriable** error codes (safe to try next adapter):
- `RATE_LIMIT`, `TIMEOUT`, `MODEL_UNAVAILABLE`, `UNKNOWN`

**Non-retriable** (fallback skipped):
- `CONTEXT_EXCEEDED`

## 7. Circuit Breaker

`CircuitBreaker` in `mesh_router.py` — per-channel (agent name), protects mesh forwarding.

```
         success
  ┌─────────────────┐
  v                 |
CLOSED ──3 failures──> OPEN ──cooldown expires──> HALF_OPEN
  ^                                                   |
  |                  success                          |
  └───────────────────────────────────────────────────┘
                     failure → back to OPEN
```

- **failure_threshold**: 3 (env: `MUSU_MESH_CB_FAIL_THRESHOLD`)
- **cooldown_seconds**: 60 (env: `MUSU_MESH_CB_COOLDOWN_SECONDS`)
- HALF_OPEN allows one probe request; success resets to CLOSED, failure re-trips

## 8. Agent Seeding

`seed_agents.py` — idempotent bootstrap of the agent roster.

**Auto-detection**: checks `shutil.which()` for `claude` → `gemini` → `codex`.

**Roles seeded** (AGENT_ROLES):

| Role | Description | Model Tier | Budget |
|------|-------------|------------|--------|
| ceo | Chief Executive Officer | frontier | $5.00 |
| cto | Chief Technology Officer | frontier | $5.00 |
| engineer | Software Engineer | frontier | $2.00 |
| cos | Chief of Staff | budget | $0.50 |
| qa | QA Engineer | frontier | $2.00 |
| worker | Worker | budget | $0.50 |

**Model tiering** (by adapter):
- claude_local: frontier = `claude-sonnet-4-6`, budget = `claude-haiku-4-5`
- gemini_local: frontier = `gemini-2.5-pro`, budget = `gemini-2.5-flash`
- codex_local: all = `gpt-5.5`

**Fallback chain**: built automatically. If primary is `claude_local` and `gemini`
CLI exists on PATH, adds gemini as fallback1. If `codex` exists, adds as fallback2.

**Node assignment**: after seeding, auto-assigns all agents to the local node
in `~/.musu/nodes.toml` via `_ensure_assignments()`.

## 9. Database

**Engine**: SQLite (via `musu_core.backends.local.LocalBackend`)

Key tables:

| Table | Purpose |
|-------|---------|
| `agents` | Agent registry (name, role, adapter_type, adapter_config, fallback_chain) |
| `tasks` | Task lifecycle (status, instruction, assigned_agent, result) |
| `companies` | Multi-tenant company scoping |
| `route_executions` | Execution log per routing attempt (run_id, agent, usage, duration) |
| `messages` | Conversation history (session-based, cursor-paginated) |
| `goals` | Strategic goals linked to companies |

Schema managed by `musu_core/migrations.py` — migration-only changes, no direct edits.

## 10. Security

**Bearer Token Auth**:
- All bridge API calls require `Authorization: Bearer <MUSU_BRIDGE_TOKEN>`
- Set via environment variable, never hardcoded

**Localhost Auth**:
- Localhost requests also require the token by default.
- `MUSU_BRIDGE_LOCALHOST_AUTH=0` is the only explicit local development bypass.

**Mesh Token Exchange**:
- Per-node tokens in `nodes.toml` (`token` field)
- Outbound peer sync prefers `MUSU_TOKEN` (account-level, same across all user nodes)
- Falls back to `MUSU_BRIDGE_TOKEN` for dev/offline setups

**Request Tracing**:
- `RequestIDMiddleware` injects a unique `request_id` via ContextVar
- Propagated through `agent_id` and `task_id` context vars for structured logging

**Subprocess Isolation**:
- Adapter strips nesting env vars (`CLAUDECODE`, `CLAUDE_CODE_SESSION`, etc.)
  to prevent Claude Code inception errors
