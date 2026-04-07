# scripts/

Smoke harnesses and utility scripts for the musu-functions workspace.

---

## mus28-crt-remote-smoke.sh — CRT remote smoke

Runs the full MUS-28 CRT remote read proof chain:

1. **Lane 2** (`mus27-live-session-harness.sh`) — builds and starts `musu-portd`,
   runs `musu-connectsd live-harness`, and produces a live proof JSON.
2. **Lane 3** (`mus28_crt_remote_read_proof.mjs`) — reads the lane-2 proof and
   produces a summary and operator-view JSON.

### Runtime prerequisites

> **musu-port must be available before invoking mus28 smoke.**

The following must be true before calling this script:

| Prerequisite | Why |
|---|---|
| `$ROOT_DIR/musu-port/` directory exists | `mus27` `cd`s into it to build `musu-portd` |
| `$ROOT_DIR/musu-port/Cargo.toml` exists | Confirms a valid Rust workspace is present |
| `$ROOT_DIR/scripts/linux-rust-env.sh` exists | Sets up the Rust toolchain used by `cargo run` |
| Port `$MUSU_LANE2_PORT` (default `18495`) is **not** in use | `mus27` binds this port for `musu-portd`; a stale process will cause a silent bind failure |

The script performs a preflight guard and exits with a clear error message if any
of these conditions are not met.  If the guard fails, check:

```
[FAIL] musu-port workspace not found at …/musu-port
       musu-port must be present before running mus28 smoke.
```

Stop any stale `musu-portd` process on port 18495 before re-running:

```bash
# Find and kill a stale musu-portd
lsof -ti tcp:18495 | xargs kill -9
```

### Usage

```bash
# default output dir: work/mus28-crt-remote-smoke/
./scripts/mus28-crt-remote-smoke.sh

# custom output dir
./scripts/mus28-crt-remote-smoke.sh /tmp/my-smoke-run
```

### Environment overrides

| Variable | Default | Description |
|---|---|---|
| `MUSU_LANE2_PORT` | `18495` | Port used by `musu-portd` |
| `MUSU_LANE2_SERVICE` | `demo-api` | Service name for the live harness |
| `MUSU_LANE2_SCENARIO` | `verified-peer` | Peer scenario (`verified-peer`, `unverified-peer`, `blocked-peer`) |
| `MUSU_LANE3_NOW` | current UTC | Timestamp injected into manifest |

---

## mus27-live-session-harness.sh — live session harness (Lane 2)

Starts `musu-portd`, waits for readiness, runs `musu-connectsd live-harness`,
validates proof semantics, and writes a manifest.

Called by `mus28-crt-remote-smoke.sh` — see prerequisites above.  Can also be
run standalone for Lane-2-only proof capture:

```bash
./scripts/mus27-live-session-harness.sh
./scripts/mus27-live-session-harness.sh --scenario blocked-peer
./scripts/mus27-live-session-harness.sh --scenario unverified-peer /tmp/out
```
