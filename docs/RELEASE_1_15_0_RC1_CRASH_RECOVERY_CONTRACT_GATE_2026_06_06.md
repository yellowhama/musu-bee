# MUSU 1.15.0-rc.1 Crash-Recovery Contract Gate

Date: 2026-06-06
Branch: `harden-relay-fallback-payload-evidence`
Base HEAD while implemented: `2642948ed5930e3cf38aed1b8bc62014d8307573`

## Summary

This pass closes a local packaged-runtime recovery gap: if the bridge service
registry contains a dead PID after a crash or forced stop, `musu up` now clears
that stale registry record before probing bridge health or starting a new
bridge.

The change is local-runtime hardening only. It does not change the product
boundary:

- MUSU Desktop remains the local executor on each device.
- MUSU.PRO remains remote input, project/company room, AI meeting room,
  presence, rendezvous, path selection, relay fallback coordination, and
  evidence/control plane.
- `localhost:3001` remains optional developer/operator dashboard behavior, not
  the packaged desktop runtime contract.

## Code Changes

- `musu-rs/src/install/cli_commands.rs`
  - `run_up` creates a `ServiceRegistry` before `check_bridge`.
  - If the registered bridge PID is dead, `run_up` calls
    `registry.cleanup_stale()` before health probing.
  - `UpReport` now includes `stale_bridge_registry_removed` and
    `stale_bridge_registry_pid`, so `musu up --json` can provide operator
    evidence when cleanup happened.
  - Text output prints the removed stale PID when applicable.

- `scripts/windows/audit-musu-crash-recovery-contract.ps1`
  - New release contract audit with schema `musu.crash_recovery_contract.v1`.
  - Verifies the `musu up` stale-registry cleanup path, existing `musu down`
    stale registry removal, `ServiceRegistry::cleanup_stale`, the existing
    stale cleanup unit test, startup single-instance evidence, process
    ownership rejection of dead bridge registry PIDs, and final go/no-go /
    handoff / operator packet wiring.

- Release gate wiring
  - `write-release-go-no-go.ps1` now exposes
    `crash_recovery_contract_verified` and `crash_recovery_contract_audit`, and
    blocks with area `crash-recovery` if the contract fails.
  - `show-final-release-handoff-status.ps1` now reports the gate and rerun
    command.
  - `prepare-final-operator-gate-packet.ps1` now copies the audit and documents
    Gate D4.
  - `verify-final-operator-gate-packet.ps1` now fails closed if packet README,
    audit script, handoff status, or go/no-go wiring omits crash recovery.
  - `test-release-evidence-verifiers.ps1` now has source-contract coverage for
    the audit, go/no-go, and freshness classifiers.
  - `verify-single-machine-evidence.ps1`,
    `verify-runtime-cpu-scenario-matrix.ps1`, and `write-release-go-no-go.ps1`
    classify the new audit script as status-only for evidence freshness.
  - `audit-desktop-release-readiness.ps1` now includes the new audit in the
    release-smoke inventory.

## Validation

Passed:

- PowerShell parser check for all touched `.ps1` scripts: `parser ok`
- `cargo fmt --check`
- `cargo check --bin musu`
- `cargo test --lib cleanup_stale_removes_dead_pids`: `1/1`
- `scripts/windows/audit-musu-crash-recovery-contract.ps1 -Json`:
  `ok=true`, `fail_count=0`
- `scripts/windows/test-release-evidence-verifiers.ps1 -Json`:
  `ok=true`, `case_count=69`, `failed_case_count=0`
- `scripts/windows/audit-desktop-release-readiness.ps1 -Json`:
  local artifacts, MSIX desktop entrypoint, desktop shell, and single-machine
  checks pass; public readiness remains false only because multi-device
  evidence is still not valid
- `git diff --check`

Operational note: an initial unscoped
`cargo test cleanup_stale_removes_dead_pids` was stopped after it began
compiling/linking all integration test binaries. The scoped replacement
`cargo test --lib cleanup_stale_removes_dead_pids` is the release-relevant unit
test used for this pass.

## Qualitative Audit

No high or medium issue was found in the changed surfaces.

The main risk reduced by this change is local startup confusion after a crash:
stale `~/.musu/services/bridge.json` data can no longer steer `musu up` toward
a dead bridge PID before a clean bridge restart.

Residual risks:

- This Rust runtime source change makes previously clean packaged runtime
  release evidence stale until evidence is regenerated from the new commit.
- The new audit is a source-contract gate, not a live crash simulation. The
  existing unit test covers `ServiceRegistry::cleanup_stale`; startup
  single-instance and process ownership cover the live happy path.
- Public release remains blocked by external gates: real second-PC
  multi-device route/CPU/matrix proof, live MUSU.PRO owner-scoped P2P/relay
  proof, support mailbox evidence, and Store/Partner Center evidence.

## Release Status

This pass closes a local crash-recovery contract gap. It does not make the
public desktop release ready.

Current blocker split after this pass:

- Local packaged runtime contract: improved and gated.
- One-machine code/audit posture: healthy.
- Multi-device public release: still blocked until second-PC and hosted P2P
  evidence exist.
- Hosted relay: still blocked until real `quic_relay_tunnel` payload movement,
  `quic_tls_1_3` relay transport proof, and relay payload delivery proof exist.
