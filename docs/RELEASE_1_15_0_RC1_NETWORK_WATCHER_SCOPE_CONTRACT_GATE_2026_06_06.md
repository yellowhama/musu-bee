# MUSU 1.15.0-rc.1 Network Watcher Scope Contract Gate

Date: 2026-06-06 KST
Branch: `harden-relay-fallback-payload-evidence`
Base HEAD before this change: `8906ba1b0cd901f06232dca04975b86549bab604`

## Summary

The Rust background-loop release audit now explicitly gates network
watcher/poller scope. This extends the resource-budget contract after the
filesystem watcher gate and keeps default MUSU Desktop from silently growing
new network scan/poll loops.

New contract:

- `musu discover` is the explicit CLI path for active mDNS discovery.
- mDNS bridge discovery remains opt-in behind `MUSU_ENABLE_MDNS=1`.
- Relay payload target polling remains opt-in behind
  `MUSU_ENABLE_RELAY_PAYLOAD_POLLER=1`.
- Logged-in MUSU.PRO registration remains the low-duty cloud heartbeat path.
- Device-code polling remains scoped to explicit `musu login`.
- Control SSE heartbeat, auto-update ticker, and relay payload handler/client
  surfaces remain allowlisted and audited.
- New network watcher/poller primitives outside the allowlist fail the audit.

## Source Changes

- `scripts/windows/audit-rust-background-loop-contract.ps1`
  - adds `discover command scoped dispatch`
  - adds `$allowedNetworkWatcherFiles`
  - scans for active network watcher/poller primitives:
    `poll_device_token`, `discover_peers`, `auto_register_peers`,
    relay payload query/claim/deliver calls, relay payload poller calls,
    `tokio::time::interval`, `IntervalStream::new`, mDNS `recv_timeout`, and
    the low-duty cloud registration loop marker
  - emits `network_watcher_primitive_hit_count`
- `scripts/windows/test-release-evidence-verifiers.ps1`
  - adds source-contract regression case
    `rust background audit limits network watcher scope`
- `scripts/windows/verify-final-operator-gate-packet.ps1`
  - verifies final operator packets contain the strengthened network watcher
    scope audit contract

## Validation

Passed:

- PowerShell parser for changed scripts
- `audit-rust-background-loop-contract.ps1 -Json`:
  - `ok=true`
  - `fail_count=0`
  - `unaudited_loop_hit_count=0`
  - `unaudited_spawn_hit_count=0`
  - `filesystem_watcher_primitive_hit_count=0`
  - `file_sync_watcher_start_hit_count=0`
  - `network_watcher_primitive_hit_count=0`
- `test-release-evidence-verifiers.ps1 -Json`:
  - `ok=true`
  - `case_count=48`
  - `failed_case_count=0`

## Code Audit

Finding severity: no high or medium runtime issue found in the changed source.

This is verifier/source-contract hardening only. It does not change runtime
behavior, replace 60-second CPU evidence, or prove hosted P2P.

Closed audit gap: the audit already had named checks for mDNS, relay payload
poller, cloud heartbeat, login polling, control SSE, and auto-update, but it
did not separately fail when a new network watcher/poller primitive appeared
outside the reviewed surfaces.

## Code And Document Indexing

MUSU local indexing was refreshed after the network watcher scope source,
report, wiki, checklist, network boundary spec, GOAL, WIKI_INDEX, and CoS
updates:

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- files: `2486`
- symbols: `2719`
- elapsed: `10887 ms`

gbrain was not rerun because the same-session blocker remains unchanged:
missing `ZEROENTROPY_API_KEY`, generated/evidence import failures,
`sync.last_commit` not advancing, and `gstack-brain-sync exited undefined`.
The MUSU local index remains the reliable current code/document index.

## Product Status

The product boundary remains unchanged:

- MUSU Desktop is the local executor and resource owner.
- MUSU.PRO is remote input, project/company room, rendezvous, path-selection,
  relay-fallback policy, and evidence control plane.
- MUSU.PRO control-plane work must not turn the default local runtime into a
  hidden network watcher.

Public desktop release remains No-Go until second-PC route/CPU/matrix evidence,
hosted owner-scoped MUSU.PRO P2P/relay proof, support mailbox proof, and Store
proof are complete.
