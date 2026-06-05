# 2026-06-06 network watcher scope contract gate

MUSU Desktop remains the local executor. MUSU.PRO remains remote input,
project/company room, rendezvous, path-selection, relay-fallback policy, and
evidence control plane.

This session strengthened the Rust background-loop release audit so default
desktop/runtime code cannot silently grow hidden network scan or poll loops.

Changed source:

- `scripts/windows/audit-rust-background-loop-contract.ps1`
  - proves active mDNS discovery is scoped to explicit `musu discover`
  - adds `$allowedNetworkWatcherFiles`
  - scans for network watcher/poller primitives including `poll_device_token`,
    `discover_peers`, `auto_register_peers`, relay payload query/claim/deliver
    calls, relay payload poller calls, `tokio::time::interval`,
    `IntervalStream::new`, mDNS `recv_timeout`, and the low-duty cloud
    registration loop marker
  - emits `network_watcher_primitive_hit_count`
- `scripts/windows/test-release-evidence-verifiers.ps1`
  - added source-contract case `rust background audit limits network watcher scope`
- `scripts/windows/verify-final-operator-gate-packet.ps1`
  - final packet verifier now checks for the stronger network watcher scope audit

Validation:

- PowerShell parser: pass
- Rust background-loop audit: `ok=true`, `fail_count=0`,
  `network_watcher_primitive_hit_count=0`
- release evidence verifier: `ok=true`, `case_count=48`,
  `failed_case_count=0`

Code audit: no high/medium runtime issue found. Audit-layer gap closed: new
network watcher/poller primitives now fail source audit unless they land in an
explicit CLI, opt-in, low-duty, or request-scoped reviewed surface.

Docs:

- GOAL v598
- wiki/773
- `RELEASE_1_15_0_RC1_NETWORK_WATCHER_SCOPE_CONTRACT_GATE_2026_06_06.md`
- BETA checklist
- network boundary spec

Public release remains No-Go on real second-PC route/CPU/matrix evidence,
hosted owner-scoped MUSU.PRO P2P/relay proof, support mailbox proof, and Store
proof.
