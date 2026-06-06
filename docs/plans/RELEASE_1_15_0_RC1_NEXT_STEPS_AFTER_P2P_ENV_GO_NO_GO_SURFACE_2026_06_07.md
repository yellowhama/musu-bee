# MUSU 1.15.0-rc.1 Next Steps After P2P Env Go/No-Go Surface

**Generated**: 2026-06-07 03:32 KST
**Related report**:
`docs\RELEASE_1_15_0_RC1_P2P_ENV_BLOCKERS_GO_NO_GO_SURFACE_2026_06_07.md`

## Current Position

Go/no-go now exposes the P2P env status blocker list directly. The current
root cause split is explicit: source release relay runtime is incomplete,
hosted storage/login/proof evidence is missing, and second-PC proof is still
absent.

## Execution Order

1. Keep this status-surface change fail-closed and committed.
2. Implement the actual release relay tunnel runtime before flipping
   `RELAY_TUNNEL_RUNTIME_IMPLEMENTED`.
3. Add the distinct release tunnel payload endpoint before flipping
   `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED`.
4. Keep preview store-forward queue evidence non-release-grade.
5. Configure production KV/Upstash and runtime login for `https://musu.pro`.
6. Record owner-scoped release-grade relay route evidence with route metadata,
   transport proof, and payload delivery proof.
7. Bring up a second Windows PC with current MUSU Desktop installed.
8. Capture successful two-machine route, idle CPU, and runtime CPU matrix
   evidence.
9. Record support mailbox and Store/Partner Center proof.

## Acceptance Criteria

- `write-release-go-no-go.ps1 -Json` contains
  `p2p_control_plane_env_ready`.
- `write-release-go-no-go.ps1 -Json` contains
  `p2p_control_plane_env_blockers`.
- `write-release-go-no-go.ps1 -Json` contains
  `p2p_control_plane_env_status`.
- The `p2p-control-plane` blocker message includes a concise env blocker
  summary when the env status has blockers.
- Release verifier regression includes the source contract for this surface.

## Audit Notes

This is diagnostic/status hardening, not a release relay payload
implementation. It improves execution focus by making the No-Go root causes
visible in the primary release report.

## Validation Baseline

- release verifier regression: `ok=true`, `case_count=96`,
  `failed_case_count=0`
- dirty go/no-go smoke: fail-closed with `p2p_control_plane_env_ready=false`
  and `12` concrete P2P env blockers
- index refresh: `2799 files`, `2776 symbols`, `18256 ms`
