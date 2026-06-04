# 2026-06-04 P2P Connect Endpoint Evidence Gate Hardening

The P2P control-plane release verifier now requires explicit relay connect
endpoint proof.

Changed:

- `verify-p2p-control-plane-evidence.ps1` now checks
  `relay_status.relay_connect_endpoint_wired` and
  `relay_transport.relay_connect_endpoint_wired`
- aggregate `relay_transport_descriptor_ok` and `relay_transport_wired` now
  include connect endpoint proof
- `record-p2p-control-plane-evidence.ps1` now includes connect endpoint proof
  in its `statusOk` and `transportOk` calculations
- `test-release-evidence-verifiers.ps1` now has a negative fixture named
  `p2p-bad-relay-connect-endpoint`

Validation:

- PowerShell parser checks passed for all edited scripts
- release evidence verifier regression passed with `ok=true`,
  `case_count=29`, `failed_case_count=0`
- latest hosted P2P evidence remains blocked with `fail_count=29`,
  `relay_status_connect_endpoint_wired=false`,
  `relay_transport_connect_endpoint_wired=false`,
  `relay_transport_payload_endpoint_wired=false`, lease store unconfigured,
  route evidence count `0`, and relay payload transport unproven

Canonical report:

- `docs\RELEASE_1_15_0_RC1_P2P_CONNECT_ENDPOINT_EVIDENCE_GATE_HARDENING_2026_06_04.md`
