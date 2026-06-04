# 2026-06-04 Rust Loop Allowlist Contract Hardening

Locked direction:

- `musu.pro` is remote input, project room, company meeting room, presence,
  rendezvous, path-selection, relay-fallback coordination, and evidence.
- Local MUSU programs execute work on each device and use `musu.pro` for
  coordination/bootstrap before preferring P2P mesh.
- `localhost` dashboards are same-machine local surfaces.

Work completed:

- Expanded `scripts\windows\audit-rust-background-loop-contract.ps1` so the
  Rust loop allowlist is no longer a bare file allowlist.
- Added explicit checks for cancellation, timeout, deadline, sleep/backoff,
  blocking receive, finite process snapshot enumeration, and request-scoped
  PTY/WebRTC loops.
- Covered Claude adapter, file sync, indexer watch, CLI login, workflow
  executor, hardware probe, PTY, WebRTC screen share, bridge process
  enumeration, and writer runner loops.

Validation:

- `audit-rust-background-loop-contract.ps1 -Json` passed with `ok=true`,
  `fail_count=0`, and `unaudited_loop_hit_count=0`.

Current status:

- This is audit/status-gate hardening only; packaged runtime evidence remains
  current.
- Public release remains blocked by second-PC multi-device evidence, two-machine
  CPU/matrix evidence, hosted `musu.pro` P2P control-plane proof, support
  mailbox evidence, and Store evidence.
