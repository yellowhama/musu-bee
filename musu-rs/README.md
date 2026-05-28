# musu-rs

Rust single-binary control plane for MUSU.

`musu-rs` replaced the legacy Python bridge/core/control/indexer/writer stack
with one `musu` binary plus the packaged Windows startup helper
`musu-startup`.

## Current Status

| Surface | Status | Notes |
|---|---|---|
| `musu bridge` | Active | Axum bridge, auth/rate-limit/audit, company/task APIs, file/KVM/proxy surfaces, MCP HTTP route, and service registry. |
| `musu core` | Active | Applies the SQLite schema and company/workflow tables without booting the bridge. |
| `musu control` | Active | MCP stdio JSON-RPC control server. |
| `musu indexer` | Active | Per-workspace file/code indexing and search. |
| `musu writer` | Active | Native task runner with route execution state and SSE updates. |
| `musu peer` | Active | Peer registration, capability metadata, registry/cache handling. |
| Installer/update commands | Active | Install, uninstall, supervise, auto-update, schema gate, and Windows package status. |

## Build

```bash
cd musu-rs
cargo build --release
```

Windows packaging also builds `musu-startup.exe`:

```powershell
cargo build --bin musu --bin musu-startup --release
```

## Run

For local development:

```bash
export MUSU_ENV=development
export BRIDGE_PORT=8070
musu bridge
```

For production, the bridge token must exist in `~/.musu/bridge.env` or be
provided through the runtime token helper. Tokens shorter than 32 characters are
rejected in production mode.

The bridge defaults to dynamic port allocation when `BRIDGE_PORT` is unset.
The actual listener is written to `~/.musu/services/bridge.json`; CLI helpers
prefer that service registry and fall back to port `8070`.

## Key Environment Variables

| Var | Default | Notes |
|---|---|---|
| `MUSU_ENV` | production | Only exact `development` or `test` relax production checks. |
| `MUSU_HOME` | `~/.musu` | Operator data and service registry root. |
| `BRIDGE_HOST` | `127.0.0.1` | Bridge bind host. |
| `BRIDGE_PORT` | dynamic (`0`) | Set `8070` for a fixed local/peer port. |
| `MUSU_BRIDGE_PUBLIC_URL` | service registry URL | URL advertised to peers/cloud registration. |
| `MUSU_BRIDGE_LOCALHOST_AUTH` | auth required | Set `0` only for explicit local dev bypass. |
| `MUSU_DISABLE_RATE_LIMIT` | off | Honored only in development/test. |
| `MUSU_ALLOW_PLAINTEXT_LAN` | off | Acknowledges bearer-token plaintext risk on LAN binds. |
| `MUSU_FILE_SERVE_ROOTS` | empty | Comma-separated roots exposed by file APIs. |
| `MUSU_TLS` | off | Enables generated or configured TLS certs. |

## Verification

```bash
cargo test --lib -- --test-threads=1
cargo test --test r13_mcp_http --test r10_registry --test r9_workflow_dag --test r7_peer_register --test w12_deadline_middleware
cargo clippy --all-targets -- -D warnings
```

Use the repository root `README.md`, `QUICKSTART.md`, and `INSTALL.md` for
operator-facing setup. This file is only the Rust runtime reference.
