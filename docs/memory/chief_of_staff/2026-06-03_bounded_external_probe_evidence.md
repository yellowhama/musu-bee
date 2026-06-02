# 2026-06-03 Bounded External Probe Evidence

Durable memory for MUSU 1.15.0-rc.1 release gate hardening.

`scripts\windows\record-external-release-gate-recheck.ps1` now accepts
`SecondPcProbeTimeoutMs` and records bounded second-PC reachability instead of
depending on `Test-NetConnection` default timing.

Clean HEAD `080bc6dc` generated:

- external evidence:
  `docs\evidence\external-gates\1.15.0-rc.1\20260603-052447-HUGH_SECOND.external-gates.evidence.json`
- external summary:
  `docs\evidence\external-gates\1.15.0-rc.1\20260603-052447-HUGH_SECOND.external-gates.summary.md`
- P2P evidence:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-052547-musu.pro.evidence.json`
- P2P verification:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-052547-musu.pro.verification.json`

Second-PC probe fields: `probe_method=bounded_ping_and_tcp`,
`probe_timeout_ms=3000`, `remote_address=192.168.1.192`,
`source_address=192.168.1.154`, `interface_alias=이더넷 2`,
`ping_succeeded=false`, `ping_elapsed_ms=2887`,
`tcp_test_succeeded=false`, `tcp_elapsed_ms=3016`, and
`tcp_error=tcp_connect_timeout`.

Release state remains No-Go: local artifacts and single-machine evidence are
true, runtime idle CPU and runtime CPU matrix are `1/2`, P2P owner scope is
blocked by `p2p_relay_lease_kv_not_configured`, and support/Store evidence is
missing.
