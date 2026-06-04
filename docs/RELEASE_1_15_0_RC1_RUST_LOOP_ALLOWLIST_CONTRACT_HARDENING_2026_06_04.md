# RELEASE 1.15.0-rc.1 Rust Loop Allowlist Contract Hardening - 2026-06-04

## Summary

The Rust background-loop audit now verifies the actual safety contract for the
remaining allowlisted loop sites instead of only checking that no new loop files
appeared outside the allowlist.

This supports the current roadmap boundary:

- `musu.pro` is the remote input, project room, company meeting room, presence,
  rendezvous, path-selection, relay-fallback coordination, and evidence plane.
- Local MUSU programs execute work on each device and prefer P2P mesh after
  web-assisted rendezvous.
- `localhost` dashboards remain same-machine local surfaces.

## Changed

`scripts\windows\audit-rust-background-loop-contract.ps1` now explicitly checks
the loop contracts for:

- `adapter\claude.rs`: per-iteration stdout timeout, cancel select, preempt
  deadline, and shared kill path.
- `install\sync.rs`: bounded batch receive timeout and cooldown sleep.
- `indexer\watch.rs`: event-driven notify wait, 2s debounce, dirty flag, and
  sqlite sidecar filtering.
- `install\cli_commands.rs`: `musu login` device-code expiry, 5s poll sleep,
  and explicit poll primitive.
- `workflow\executor.rs`: 2s task-completion polling, terminal-state exit, and
  1h max wait.
- `peer\hardware.rs`: nonblocking child probe wait, 50ms sleep step, and timeout
  kill.
- `bridge\handlers\pty.rs`: request-scoped blocking PTY read and websocket
  close exit.
- `io\webrtc.rs`: request-scoped ffmpeg screen-share read loop and child kill
  on failure/exit.
- `bridge\services.rs`: finite Windows process snapshot enumeration.
- `writer\runner.rs`: admission notify/sleep/cancel select and bounded stdout
  stream reads.

## Validation

- `audit-rust-background-loop-contract.ps1 -Json` passed:
  - `ok=true`
  - `fail_count=0`
  - `unaudited_loop_hit_count=0`

## Release Status

This is audit/status-gate hardening only. No packaged runtime source was changed,
so the current primary-machine packaged smoke/CPU/matrix evidence remains the
latest runtime evidence.

Public desktop release remains No-Go until:

- real second-PC multi-device evidence is recorded,
- runtime idle CPU and runtime CPU matrix evidence pass on at least two machines,
- live `https://musu.pro` P2P control-plane proof passes,
- `musu@musu.pro` support mailbox delivery is operator-verified, and
- Store/Partner Center evidence is recorded.
