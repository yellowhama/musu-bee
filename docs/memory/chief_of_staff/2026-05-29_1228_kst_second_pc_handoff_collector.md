# CoS Memory Note - Second-PC Handoff Collector (2026-05-29 12:28 KST)

## Facts

- Added `scripts/windows/collect-second-pc-handoff.ps1`.
- The script runs `musu up --json`, `musu doctor --json`, and `musu status`, lists non-loopback IPv4 addresses, parses the bridge port, and writes `.local-build/second-pc-handoff/*.handoff.json`.
- The JSON includes `suggested_remote_addrs` values such as `<ip>:<bridge-port>` for the primary PC's `smoke-multidevice-beta.ps1 -RemoteAddr`.
- `prepare-multidevice-test-kit.ps1` now includes the helper and documents it in the kit README.
- `prepare-final-operator-gate-packet.ps1` includes the helper in the final packet.
- `verify-final-operator-gate-packet.ps1` now checks the packet README, packet scripts, nested kit zip contents, and kit README for the helper.

## Decision

- Operators should return three second-PC artifacts: MSIX install evidence, second-PC handoff JSON, and multi-device smoke evidence.
- The handoff JSON is not release proof by itself; it reduces RemoteAddr/node-name mistakes before the real multi-device smoke.
