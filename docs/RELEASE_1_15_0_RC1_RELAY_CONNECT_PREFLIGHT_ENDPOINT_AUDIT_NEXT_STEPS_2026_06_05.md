# MUSU 1.15.0-rc.1 Relay Connect Preflight Endpoint, Audit, and Next Steps

Date: 2026-06-05 KST
Branch: `harden-relay-fallback-payload-evidence`
Base HEAD before this change: `58f2cde51edc510de44ab88e5044dccc1a9ab0ab`

## Summary

`/api/v1/relay/connect` is no longer an always-501 placeholder. It is now an
authenticated owner-scoped release-connect preflight endpoint:

- `GET` returns `musu.relay_connect.v1` status behind P2P control auth.
- `POST` validates `lease_id`, `session_id`, `source_node_id`, and
  `target_node_id`.
- `POST` queries the owner-scoped relay lease store before reporting any
  release connect decision.
- Store/query failures return a structured `503 relay_connect_store_failed`
  instead of leaking as an unshaped server error.

This is not release-grade relay payload transport. Current source still keeps:

- `RELAY_CONNECT_ENDPOINT_IMPLEMENTED=true`
- `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false`
- `RELAY_PAYLOAD_QUEUE_ENDPOINT_IMPLEMENTED=true`
- `RELAY_TRANSPORT_KIND=websocket_tunnel`
- `RELEASE_GRADE_TRANSPORT_REQUIRED=quic_tls_1_3`

The product boundary is unchanged: MUSU Desktop is the local executor. MUSU.PRO
is remote input, project/company room, meeting, rendezvous, path selection,
relay fallback policy, and evidence/control plane. A user can submit work
through MUSU.PRO, but actual work runs on each local MUSU program.

## Source Changes

- `musu-bee/src/lib/p2pRelayPolicy.ts`
  - marks the release connect preflight endpoint as implemented
  - keeps the release payload endpoint disabled
  - keeps the release transport kind gate on `quic_tls_1_3`
- `musu-bee/src/lib/p2pRelayLeaseStore.ts`
  - adds `lease_id` filtering to owner-scoped relay lease queries
- `musu-bee/src/app/api/v1/relay/connect/route.ts`
  - replaces the old fail-closed placeholder with authenticated preflight
  - verifies the owner-scoped lease before any release connect decision
  - reports lease store status and keeps payload transit blocked
- `musu-bee/src/app/api/v1/relay/connect/route.test.ts`
  - covers auth, preflight status, owner scope, lease verification, and
    continued payload endpoint blocking
- `scripts/windows/audit-operator-api-security-contract.ps1`
  - now gates relay connect auth plus owner-scoped lease validation
- `scripts/windows/audit-p2p-store-forward-relay-contract.ps1`
  - now accepts source-wired connect preflight while still rejecting payload
    transport claims
- `scripts/windows/show-musu-pro-p2p-env-status.ps1`
  - now reports connect preflight separately from missing payload endpoint

## Validation

Passed:

- PowerShell parser check for:
  - `show-musu-pro-p2p-env-status.ps1`
  - `audit-p2p-store-forward-relay-contract.ps1`
  - `audit-operator-api-security-contract.ps1`
- `npm run test:p2p`: `85/85`
- `npm run test:routes`: `19/19`
- `npm run typecheck`
- `scripts\windows\audit-p2p-store-forward-relay-contract.ps1 -FailOnProblem -Json`:
  `ok=true`, `fail_count=0`
- `scripts\windows\audit-operator-api-security-contract.ps1 -FailOnProblem -Json`:
  `ok=true`, `fail_count=0`
- `git diff --check`

`show-musu-pro-p2p-env-status.ps1 -Json` now reports the intended source split:

- `relay_connect_endpoint_implemented=true`
- `release_connect_fail_closed_placeholder_active=false`
- `relay_payload_endpoint_implemented=false`
- `release_payload_endpoint_queue_only=true`
- `relay_payload_queue_fallback_implemented=true`
- `relay_transport_kind=websocket_tunnel`
- `relay_transport_kind_release_grade=false`

Remaining hosted P2P blockers:

- `source_release_relay_payload_endpoint_not_implemented`
- `source_release_payload_endpoint_queue_only`
- `source_relay_transport_kind_not_release_grade`
- missing KV/Upstash URL/token names
- live evidence still fails with `p2p_relay_lease_kv_not_configured`
- live relay transport not wired
- live relay route not proven
- live relay payload delivery proof missing

Dirty-tree go/no-go at `2026-06-05T23:47:55+09:00` reports:

- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `msix_install_verified=true`
- `runtime_idle_cpu_verified=false`, valid machines `1/2 [HUGH_SECOND]`
- `runtime_cpu_scenario_matrix_verified=false`, valid machines
  `1/2 [HUGH_SECOND]`
- `multi_device_verified=false`
- `p2p_control_plane_verified=false`
- `manifest_git.dirty=true`

After this source change is committed, fresh current-HEAD packaged evidence
should be refreshed before claiming current-source local artifact readiness.

## Code Audit

Finding severity: no high or medium issue found.

Reviewed risks and outcome:

- Auth boundary: `GET` and `POST` both call `authorizeP2pControl(req)` before
  returning relay status or touching lease state.
- Owner boundary: `POST` derives `owner_key` from the authenticated control
  principal and queries leases by owner, lease, session, source, and target.
- Payload boundary: the route verifies a lease but still returns
  `409 relay_payload_endpoint_not_wired` because release payload transport is
  not implemented.
- Release boundary: env flags cannot bypass `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false`
  or the `websocket_tunnel` vs `quic_tls_1_3` transport-kind gate.
- Operational failure mode: relay lease store failure now returns a shaped
  `503 relay_connect_store_failed` response with store status instead of an
  unhandled exception.

Residual risks:

- This does not exercise live `https://musu.pro` production KV/Upstash storage;
  live evidence still fails before owner-scoped relay leases can be proven.
- This does not implement relay payload bytes moving through MUSU infrastructure.
- This does not implement release-grade QUIC/TLS relay transport.
- The current source change touches web runtime code, so local packaged
  evidence remains stale until the package is rebuilt/reinstalled and evidence
  is refreshed after commit.

## Qualitative Evaluation

This is good progress because it removes a fake blocker without weakening the
release gate. The system now has a real connect preflight boundary that can
check an owner-scoped relay lease, which matches the intended `musu.pro` role:
coordination first, payload transport only after explicit proof.

The release posture is still No-Go. The hard blockers are substantive:
second-PC execution evidence is missing, two-machine CPU/matrix evidence is
missing, hosted P2P storage is not configured, relay payload transport is not
wired, and no live release-grade relay route/delivery proof exists.

## Next Steps

1. Provision hosted P2P storage on MUSU.PRO: Vercel KV or Upstash Redis URL and
   token, then redeploy and rerun live P2P evidence.
2. Add a distinct release tunnel payload endpoint. Do not reuse the preview
   store-forward queue as release-grade transport.
3. Replace `RELAY_TRANSPORT_KIND=websocket_tunnel` with a proven
   `quic_tls_1_3` transport only after actual relay/tunnel payload bytes can
   produce `musu.relay_transport_proof.v1`.
4. Record owner-scoped live relay route evidence with payload delivery proof.
5. Rebuild/reinstall the packaged app and refresh current-HEAD single-machine,
   idle CPU, and runtime matrix evidence after this source commit.
6. Install the same build on a reachable second Windows PC and collect
   multi-device, second-PC idle CPU, and second-PC runtime matrix evidence.
7. Record `musu@musu.pro` support mailbox evidence and Partner Center/Store
   evidence.

## Index Refresh

After this report, spec, wiki, checklist, and CoS memory updates, the MUSU local
indexer was refreshed:

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- result: `2435 files`, `2707 symbols`, `10569 ms`

gbrain was not rerun because the same-session blocker remains missing
`ZEROENTROPY_API_KEY`, generated/evidence import failures, `sync.last_commit`
not advancing, and `gstack-brain-sync exited undefined`. The MUSU local index
is the reliable current code/document index for this repo on this machine.
