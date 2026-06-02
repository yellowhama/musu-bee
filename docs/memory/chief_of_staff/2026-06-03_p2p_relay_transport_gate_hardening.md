# 2026-06-03 P2P Relay Transport Gate Hardening

Durable decision:

- `musu.pro` P2P release evidence must not pass from relay lease control-plane
  proof alone.
- `verify-p2p-control-plane-evidence.ps1` now requires
  `relay_status.relay_transport_wired=true` and
  `relay_leases.relay_transport_wired=true`.
- `show-musu-pro-p2p-env-status.ps1` reports
  `relay_status_transport_wired`, `relay_leases_transport_wired`, and combined
  `relay_transport_wired`.
- The env status preflight now emits
  `live_evidence_relay_transport_not_wired` when live evidence does not prove
  relay payload transport.
- `write-release-go-no-go.ps1` now says the live P2P gate requires
  `relay_default_data_path=false` and `relay_transport_wired=true`.

Validation:

- PowerShell parser passed for the changed scripts.
- `test-release-evidence-verifiers.ps1 -Json` passed `18/18`.
- New regression case: `p2p rejects lease-only relay without payload transport`.
- Live P2P evidence `20260603-070018-musu.pro` now verifies as `ok=false`,
  `fail_count=8`, including relay status/lease transport failures.
- `show-musu-pro-p2p-env-status.ps1 -Json` now lists four blockers:
  missing KV/Upstash URL, missing KV/Upstash token,
  `live_evidence_p2p_relay_lease_kv_not_configured`, and
  `live_evidence_relay_transport_not_wired`.
- Clean post-commit go/no-go reports
  `manifest_git.dirty=false`, public release No-Go, `local_artifacts_ready=false`
  due `runtime-package`, `single_machine_verified=true`, `msix_install_verified=true`,
  `msix_desktop_entrypoint_verified=true`, `public_metadata_ok=true`,
  `p2p_control_plane_verified=false`, and `p2p_relay_transport_wired=false`.

Product interpretation:

- This is a gate-integrity fix, not a P2P completion.
- `musu.pro` remains the account/rendezvous/path-selection/relay lease control
  plane.
- Public P2P readiness still requires production KV/Upstash storage plus actual
  relay payload transport evidence.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_P2P_RELAY_TRANSPORT_GATE_HARDENING_2026_06_03.md`
