# musu-rs — V24 single-binary musu control plane

V24 Rust replacement for the Python `musu-bridge` + `musu-core` + `musu-control`
+ `musu-indexer` + `musu-writer` stack. Single binary, four subcommands.

## Status

| Phase | Component | Status |
|---|---|---|
| R0 | Workspace bootstrap | shipped (5a5ee25) |
| R1 | `musu bridge` (this commit) | shipped — see wiki/491 |
| R2 | `musu core` (schema v1) | pending |
| R3 | `musu indexer` | pending |
| R4 | `musu writer` | pending |
| R5 | Replace bridge writer-stub with native Rust | pending |
| R6 | `musu control` + installer | pending (R-cleanup) |
| R7 | musu-bee BRIDGE_URL wire-up | pending |

## Build

```bash
cd musu-rs
cargo build --release
# → target/release/musu(.exe)
```

## Run (R-fast dual mode)

R1 ships the bridge module + facade reverse-proxy to Python. R-fast requires
both Rust :8070 and Python :8071 running together. Use the wrapper:

```bash
export MUSU_BRIDGE_TOKEN=$(head -c 24 /dev/urandom | base64)   # ≥32 chars
scripts/v24-rfast-dual-start.sh
```

Or manually for development:

```bash
export MUSU_BRIDGE_TOKEN=$(printf 'a%.0s' {1..32})
export MUSU_ENV=development
./target/release/musu bridge
```

## Endpoints (R1 native)

| Method | Path | Source |
|---|---|---|
| GET | `/health` | bridge/handlers/health.rs |
| GET | `/health/ready` | bridge/handlers/health.rs |
| GET, POST | `/api/companies` | bridge/handlers/companies.rs |
| POST | `/api/companies/{id}/activate` | bridge/handlers/companies.rs |
| POST | `/api/companies/{id}/run` | bridge/handlers/run.rs (writer-stub) |
| POST | `/api/tasks/delegate` | bridge/handlers/tasks.rs (writer-stub) |
| GET | `/api/nodes` | bridge/handlers/nodes.rs |
| POST | `/api/nodes/add` | bridge/handlers/nodes.rs |

All other paths are reverse-proxied to Python `127.0.0.1:8071` via the facade
(bridge/facade.rs) with SSE streaming preserved for `text/event-stream`.

## Environment variables (wiki/491 §8)

| Var | Default | Notes |
|---|---|---|
| `MUSU_BRIDGE_TOKEN` | required in prod | ≥32 chars in prod |
| `MUSU_ENV` | (prod) | only exact `development` or `test` downgrades |
| `BRIDGE_HOST` | `127.0.0.1` | bind address |
| `BRIDGE_PORT` | `8070` | bind port |
| `MUSU_PYTHON_BRIDGE_PORT` | `8071` | facade target port |
| `MUSU_TOKEN` | (none) | secondary bearer for peer sync |
| `MUSU_BRIDGE_LOCALHOST_AUTH` | (auth required) | set `0` to bypass localhost auth |
| `MUSU_DISABLE_RATE_LIMIT` | off | only honored in dev/test |
| `MUSU_RATE_LIMIT_PER_MIN` | `60` | per-IP sliding window |
| `MUSU_ALLOW_PLAINTEXT_LAN` | off | suppresses non-loopback bind warning |
| `MUSU_BRIDGE_DB_PATH` | `~/.musu/db/musu.db` | sqlx pool target |
| `MUSU_BRIDGE_AUDIT_DB` | `~/.musu/data/audit.db` | reserved (R-cleanup) |
| `MUSU_NODES_TOML_PATH` | `~/.musu/nodes.toml` | nodes mesh state |
| `MUSU_V24_FACADE_TARGET` | off | Python-side guard — `1` enforces `BRIDGE_HOST=127.0.0.1` |

## Tests

```bash
cargo test
cargo clippy --all-targets -- -D warnings
```

41 unit tests cover the security-critical auth + config + rate-limit + dedup
surface area. See wiki/491 §4 "Unit tests required" for the C-SEC-1..12
test inventory.
