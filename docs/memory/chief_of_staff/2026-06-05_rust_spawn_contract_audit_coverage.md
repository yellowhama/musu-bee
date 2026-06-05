# 2026-06-05 Rust Spawn Contract Audit Coverage

Commit `94a89614` extends
`scripts\windows\audit-rust-background-loop-contract.ps1` to cover Rust
background execution entry points, not just loop syntax.

The verifier now audits current `tokio::spawn`,
`tokio::task::spawn_blocking`, `std::thread::spawn`, and `thread::spawn` sites
and fails future spawn use in new Rust files unless the file is explicitly
allowlisted and contract-audited.

Validation:

- PowerShell parser passed.
- Rust background-loop audit passed with `ok=true`, `fail_count=0`,
  `unaudited_loop_hit_count=0`, `unaudited_spawn_hit_count=0`,
  `telemetry_flush_primitive_hit_count=0`, and `check_count=200`.
- Frontend polling audit stayed green with `ok=true`, `fail_count=0`, and
  `low_duty_polling_call_site_count=29`.
- `git diff --check` passed.
- Clean go/no-go after commit kept local artifacts, single-machine, MSIX
  install, targeted second-PC route CPU, Rust/idle/frontend contracts, and P2P
  store-forward contract true with `manifest_git_dirty=false`.

Qualitative audit: no high or medium issue found. This is verifier-only
hardening and does not change runtime behavior or the product boundary. MUSU
Desktop remains the local executor. MUSU.PRO remains remote input,
project/company room, rendezvous, path-selection, relay-fallback policy, and
evidence control plane.

Public release remains No-Go on six unchanged blockers: second-PC
multi-device, second-PC idle CPU, second-PC runtime CPU scenario matrix,
support mailbox, Store release, and hosted P2P control-plane proof.
