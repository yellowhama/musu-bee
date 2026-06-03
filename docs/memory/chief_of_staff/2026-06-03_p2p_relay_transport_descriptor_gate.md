# 2026-06-03 P2P relay transport descriptor gate

Durable fact:

- Added authenticated `GET /api/v1/p2p/relay/transport` with schema
  `musu.p2p_relay_transport.v1`.
- Added `musu relay transport --json` with schema `musu.relay_transport.v1`.
- `record-p2p-control-plane-evidence.ps1` now captures `relay_transport`.
- `verify-p2p-control-plane-evidence.ps1` now fails unless the transport
  descriptor is present, owner-scoped, `ok=true`, `relay_transport_wired=true`,
  `relay_default_data_path=false`, `relay_url` is `wss://`, payload transit
  requires a lease, and relay lease storage is release-grade.
- `MUSU_P2P_RELAY_TRANSPORT_WIRED=1` remains insufficient without owner-scoped
  release-grade relay route evidence and payload proof.

Validation:

- `npm run test:p2p` passed 34/34.
- `npm run typecheck` passed.
- `cargo check --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1` passed.
- PowerShell parser validation passed.
- Release evidence verifier regressions passed 20/20.
- Existing live P2P evidence `20260603-093640-musu.pro` failed closed under the
  new verifier with `fail_count=31`.
- `git diff --check` passed.

Release interpretation:

- This is a fail-closed evidence/preflight gate, not relay payload transport.
- Public release still requires real relay/tunnel payload transport, owner-scoped
  release-grade relay route evidence, second-PC evidence, two-machine CPU/matrix
  evidence, support mailbox evidence, and Store evidence.
- Source changed after the latest primary evidence refresh, so primary
  MSIX/smoke/CPU/matrix evidence must be refreshed again after commit/build.
