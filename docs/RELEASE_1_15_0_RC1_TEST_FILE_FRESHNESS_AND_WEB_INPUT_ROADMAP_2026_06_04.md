# MUSU 1.15.0-rc.1 Test File Freshness and Web Input Roadmap

Date: 2026-06-04

## Summary

Release freshness classifiers now treat TypeScript test/spec source files as
status-only changes:

- `*.test.ts`
- `*.test.tsx`
- `*.spec.ts`
- `*.spec.tsx`

This fixes the false stale-evidence result caused by adding a hosted
route-evidence regression test. The test file changed the release gate coverage,
but it did not change the packaged runtime.

## Roadmap Lock

The product split is explicit:

- `localhost` / `127.0.0.1` dashboards are local-only operator and development
  surfaces.
- `musu.pro` is the web input, project room, company meeting room, rendezvous,
  path-selection, relay-fallback coordination, and evidence plane.
- Local MUSU programs perform the actual work on each device.
- A remote user can enter an order through `musu.pro`; the authenticated local
  MUSU program receives the work order and executes it locally.
- Multiple MUSU programs can use `musu.pro` for identity, presence, project
  context, meeting-room coordination, and initial connection/rendezvous, then
  prefer direct P2P mesh routes after the connection is established.
- Relay remains a Connect/Pro fallback path and must not become the default data
  path.

Current validation is still one-machine validation. True multi-device proof
requires installing the same current MUSU build on a second Windows PC and
capturing second-PC route, CPU, matrix, and relay evidence.

## Change

Updated the release freshness status-only classifier in:

- `scripts\windows\write-release-go-no-go.ps1`
- `scripts\windows\verify-single-machine-evidence.ps1`
- `scripts\windows\verify-runtime-cpu-scenario-matrix.ps1`

Updated verifier regression coverage in:

- `scripts\windows\test-release-evidence-verifiers.ps1`

The regression now includes static classifier contract cases for all three
freshness users, proving the test/spec source-file patterns are present.

## Validation

- PowerShell parser check passed for the four modified scripts
- `test-release-evidence-verifiers.ps1 -Json` passed with `ok=true`,
  `case_count=28`, and `failed_case_count=0`
- `git diff --check` passed with only existing CRLF normalization warnings for
  `docs\GOAL.md` and `docs\WIKI_INDEX.md`

## Clean Go/No-Go Result

Clean HEAD `dd4fb7efab643c52cc47bcbb6ddd921058ef437a` restored the expected
release interpretation:

- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `msix_install_verified=true`
- `msix_desktop_entrypoint_verified=true`
- `runtime_idle_cpu_valid_machines=1/2 [HUGH_SECOND]`
- `runtime_cpu_scenario_matrix_valid_machines=1/2 [HUGH_SECOND]`
- `frontend_polling_contract_verified=true`
- `rust_background_loop_contract_verified=true`
- `process_ownership_verified=true`
- `startup_single_instance_verified=true`
- `desktop_single_instance_verified=true`
- `public_metadata_ok=true`
- `manifest_git.dirty=false`

Remaining blockers are unchanged external and second-machine gates:

- `multi-device`
- `runtime-idle-cpu`
- `runtime-cpu-scenario-matrix`
- `support-mailbox`
- `store-release`
- `p2p-control-plane`

Hosted P2P is still not release-grade:

- `p2p_owner_scope_verified=false`
- `p2p_relay_lease_store_release_grade=false`
- `p2p_relay_transport_wired=false`
- `p2p_relay_status_transport_descriptor_wired=true`
- `p2p_relay_status_payload_endpoint_wired=false`
- `p2p_relay_transport_payload_endpoint_wired=false`
- `p2p_relay_route_evidence_count=0`
- `p2p_relay_payload_transport_proven=false`
- `p2p_relay_payload_delivery_proof_valid_count=0`

## Release Impact

This is release tooling and roadmap documentation only. It does not change the
packaged runtime and does not implement release-grade relay/tunnel payload
transport.

The clean release interpretation confirms that current primary MSIX/smoke/CPU
/matrix evidence remains usable because the only intervening source change is
test-only.

Public release remains blocked on:

- second-PC multi-device route evidence
- second-PC runtime idle CPU evidence
- second-PC runtime CPU scenario matrix evidence
- hosted `musu.pro` KV/Upstash relay storage
- owner-scoped release-grade relay route evidence
- relay payload transport proof and delivery proof
- support mailbox evidence
- Store/Partner Center evidence
