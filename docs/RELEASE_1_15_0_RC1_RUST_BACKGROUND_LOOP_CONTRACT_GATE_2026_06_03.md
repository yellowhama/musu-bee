# MUSU 1.15.0-rc.1 Rust Background Loop Contract Gate

Date: 2026-06-03 20:30 KST

## Summary

Added a release-gate audit for Rust bridge/runtime background loops. The new
`scripts\windows\audit-rust-background-loop-contract.ps1` emits
`musu.rust_background_loop_contract.v1` and fails if the default desktop path is
not proven low-duty.

This is release tooling hardening. It does not change runtime source or replace
the existing 60s CPU evidence gates; it makes loop regressions fail earlier.

## Contract

The audit verifies:

- planner loop is opt-in via `MUSU_ENABLE_PLANNER`, sleeps every cycle, and has
  bounded child timeout plus `kill_on_drop`
- clipboard polling is opt-in via `MUSU_ENABLE_CLIPBOARD_SYNC`
- mDNS is opt-in via `MUSU_ENABLE_MDNS`; IPv6, Tailscale, and virtual/VPN
  interfaces remain separately opt-in
- mDNS browse is duration bounded, receive timeout bounded, and exits on
  disconnected receivers
- cloud registration heartbeat defaults to `300s`, clamps to at least `60s`,
  tracks failures, and sleeps with backoff/jitter
- file sync uses bounded queues/batches, nonblocking `try_send`, idle `recv`,
  peer request timeouts, and batch-cap cooldown
- auto-update supervise refuses intervals below 5 minutes, skips immediate boot
  ticks, and health polling uses capped delay sleeps
- new Rust `loop {` / `while true` constructs outside the audited allowlist fail
  the audit until explicitly reviewed

## Release Gate Wiring

`write-release-go-no-go.ps1` now runs the audit and emits:

- `rust_background_loop_contract_verified`
- `rust_background_loop_contract_audit`

If the audit fails, public release gets a `rust-background-loops` blocker.
`show-final-release-handoff-status.ps1`, final operator packet generation, and
final packet verification now include the new audit.

## Validation

- `audit-rust-background-loop-contract.ps1 -FailOnProblem -Json` passed with
  `ok=true`, `fail_count=0`, and `unaudited_loop_hit_count=0`.
- `write-release-go-no-go.ps1 -ScriptTimeoutSeconds 120 -Json` reported
  `rust_background_loop_contract_verified=true` and `rust_fail_count=0`; the
  extra `git` blocker was expected from the dirty tooling/docs worktree.
- `audit-desktop-release-readiness.ps1 -Json` still reports local package,
  desktop shell, and single-machine readiness true; its only failure remains the
  existing second-PC multi-device evidence.
- `git diff --check` passed.

## Release Status

Public release remains No-Go on second-PC multi-device/runtime CPU evidence,
hosted P2P relay payload proof, support mailbox evidence, and Store evidence.
