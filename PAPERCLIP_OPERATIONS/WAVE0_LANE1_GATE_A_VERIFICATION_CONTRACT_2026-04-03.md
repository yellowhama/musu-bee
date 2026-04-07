# Wave 0 Lane 1 Gate A Verification Contract (2026-04-03)

## Purpose

`MUS-26` lane 1 defines a repo-wide verification contract that separates:

1. code-health verification (source-level correctness)
2. host-toolchain-health verification (runtime/toolchain/environment compatibility)

This separation prevents environment drift from being misread as product-code regression.

## Scope

Lane 1 covers the root operation stack:

- `musu-port`
- `musu-connects`
- `MUSU-CRT`
- `MUSU-WORKS`
- `MUSU-AS-MCP`
- `musu-indexer`

## Contract

### Lane A: Code Health

Lane A answers: "Is the codebase itself structurally healthy?"

- Run deterministic syntax/static/build-surface checks.
- Report module-level warnings/errors as code-health outcomes.
- Do not mark Lane A blocked for missing host profile setup unless a command in this lane requires it by design.

### Lane B: Host Toolchain Health

Lane B answers: "Can this host/runtime execute required build/runtime commands?"

- Capture toolchain versions, PATH resolution, and linker availability.
- Treat failures like missing/old compiler/linker as environment blockers, not code blockers.
- Escalate Lane B blockers to board/ops with exact command evidence.

## Boundary Note Linked To Existing Blockers

Current boundary is explicitly tied to prior blocker history:

- [MUS-17](/MUS/issues/MUS-17) comment thread shows implementation complete while validation failed on environment/linker path.
- [MUS-22](/MUS/issues/MUS-22) comment thread shows routine-level execution blocked by runtime/toolchain mismatch.

Observed in this run (2026-04-03):

- default cargo in current heartbeat runtime: `/usr/bin/cargo` -> `cargo 1.75.0`
- this cargo fails workspace checks because lockfile is v4 (`requires -Znext-lockfile-bump`)
- rustup cargo exists and works: `~/.cargo/bin/cargo` -> `cargo 1.91.1`
- with rustup cargo pinned, workspace checks pass
- canonical root shim exists: `/home/hugh51/musu-functions/scripts/linux-rust-env.sh`
- canonical Gate A verifier exists: `/home/hugh51/musu-functions/scripts/verify-wave0-lane1.sh`

Conclusion:

- `cargo` path/toolchain version is a Lane B boundary condition.
- code health must be evaluated with an explicit toolchain command path until runtime PATH is normalized.
- the current canonical path is the root shim (`/home/hugh51/musu-functions/scripts/linux-rust-env.sh`).

## Reproducible Verification Command Matrix

| ID | Command | Run In | Lane | Last Observed |
| --- | --- | --- | --- | --- |
| A1 | `cd MUSU-AS-MCP && npm run -s check` | Codex runtime | Code health | Pass |
| A2 | `cd musu-indexer && python3 -m compileall -q src/musu_indexer` | Codex runtime | Code health | Pass |
| B1 | `cd musu-connects && env PATH=/usr/bin:/bin cargo check -p musu-connects-core` | Simulated stale runtime PATH | Toolchain health | Fail: lockfile v4 unsupported by cargo 1.75 |
| B2 | `cd musu-port && env PATH=/usr/bin:/bin cargo check -p musu-port-core` | Simulated stale runtime PATH | Toolchain health | Fail: lockfile v4 unsupported by cargo 1.75 |
| B3 | `cd musu-connects && /home/hugh51/musu-functions/scripts/linux-rust-env.sh cargo check -p musu-connects-core` | Codex runtime (canonical shim) | Toolchain health | Pass |
| B4 | `cd musu-port && /home/hugh51/musu-functions/scripts/linux-rust-env.sh cargo check -p musu-port-core` | Codex runtime (canonical shim) | Toolchain health | Pass |
| B5 | `cd musu-connects && /home/hugh51/musu-functions/scripts/linux-rust-env.sh cargo test -p musu-connects-core --no-run` | Codex runtime (canonical shim) | Toolchain health | Pass |
| B6 | `cd musu-port && /home/hugh51/musu-functions/scripts/linux-rust-env.sh cargo test -p musu-port-core --no-run` | Codex runtime (canonical shim) | Toolchain health | Pass |
| B7 | `/home/hugh51/musu-functions/scripts/linux-rust-env.sh cargo --version` | Codex runtime (canonical shim) | Toolchain health | Must report `>= 1.85` |
| B8 | `/home/hugh51/musu-functions/scripts/verify-wave0-lane1.sh` | Root repo | Gate A verification | Pass |

Notes:

- B1/B2 are intentionally kept as negative controls to detect PATH regression.
- B3-B6 are canonical checks for current lane execution.
- B8 is the root one-shot verifier for `MUS-26`.

## Gate A Lane 1 Deliverables

This document satisfies all required lane-1 outputs for Gate A:

- repo-wide verification contract (Lane A vs Lane B)
- explicit boundary note linked to blocker context from [MUS-17](/MUS/issues/MUS-17) and [MUS-22](/MUS/issues/MUS-22)
- reproducible command matrix with runtime-vs-host execution separation

## Ops Unblock Ask

To remove recurring routine-level false blockers:

1. normalize Founding Engineer runtime PATH to prefer `~/.cargo/bin` over `/usr/bin` for `cargo` and `rustc`
2. apply the same normalization to routine-triggered engineer runs that feed [MUS-22](/MUS/issues/MUS-22)
3. keep B1/B2 in periodic checks as drift detectors

## Current Result

The canonical root verifier now passes:

- command: `/home/hugh51/musu-functions/scripts/verify-wave0-lane1.sh`
- last observed summary: `pass=8 fail=0 info=1`
