# MUSU 1.15.0-rc.1 External Gate Recheck After CEO Dispatch Evidence

Date: 2026-06-04 14:39 KST

## Summary

After the CEO dispatch SSE cleanup and refreshed primary-machine evidence, the
external release gates were rechecked from the packaged Windows alias:

- `C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe`

The result remains public release No-Go. Local artifacts, MSIX install, and the
single-machine path are current and passing on `HUGH_SECOND`; the open blockers
are external and two-machine:

- second-PC route/CPU/matrix evidence
- live `musu.pro` P2P control-plane relay proof
- support mailbox evidence
- Store/Partner Center release evidence

## Evidence

- external gate evidence:
  `docs\evidence\external-gates\1.15.0-rc.1\20260604-143952-HUGH_SECOND.external-gates.evidence.json`
- external gate summary:
  `docs\evidence\external-gates\1.15.0-rc.1\20260604-143952-HUGH_SECOND.external-gates.summary.md`
- live P2P evidence:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260604-144053-musu.pro.evidence.json`
- live P2P verification:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260604-144053-musu.pro.verification.json`
- live P2P summary:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260604-144053-musu.pro.summary.md`

## Local Hardening Audits

The local/runtime hardening contracts remain clean:

- Rust background-loop audit: `ok=true`, `fail_count=0`,
  `unaudited_loop_hit_count=0`
- frontend polling audit: `ok=true`, `fail_count=0`,
  `direct_interval_hit_count=0`, `direct_visibility_listener_hit_count=0`
- process ownership audit: `ok=true`, `fail_count=0`, runtime `1`,
  desktop shell `1`, owned Node `0`, owned WebView2 `6`, repo orphan helpers
  `0`
- local API auth contract audit: `ok=true`, `fail_count=0`
- operator API security contract audit: `ok=true`, `fail_count=0`

## Gate Result

External recheck result:

- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `msix_install_verified=true`
- runtime idle CPU valid machines: `1`
- runtime CPU scenario matrix valid machines: `1`
- `multi_device_verified=false`
- `support_mailbox_verified=false`
- `store_release_verified=false`
- `p2p_control_plane_verified=false`

Second-PC probe:

- target: `192.168.1.192:8949`
- source address: `192.168.1.154`
- interface: `이더넷 2`
- ping succeeded: `false`
- TCP succeeded: `false`
- TCP error: `tcp_connect_timeout`

Live `musu.pro` P2P result:

- logged-in relay status query succeeds
- bridge path selection, rendezvous session, route evidence client, and relay
  lease control-plane wiring are visible
- relay status transport descriptor is wired: `true`
- relay transport descriptor is wired: `true`
- relay status payload endpoint wired: `false`
- relay transport wired: `false`
- relay transport URL: empty
- relay lease store configured: `false`
- relay lease store backend: `unconfigured`
- relay lease store release-grade: `false`
- relay leases ok: `false`
- relay route evidence ok: `false`
- relay route evidence count: `0`
- relay payload transport proven: `false`
- relay payload delivery proof valid count: `0`

Current P2P env blockers:

- `missing_kv_rest_api_url_or_upstash_redis_rest_url`
- `missing_kv_rest_api_token_or_upstash_redis_rest_token`
- `live_evidence_p2p_relay_lease_kv_not_configured`
- `live_evidence_relay_transport_not_wired`
- `live_evidence_relay_route_not_proven`
- `live_evidence_relay_payload_delivery_proof_missing`

External recheck blockers:

- `release_go_no_go_not_ready`
- `go_no_go_multi_device`
- `go_no_go_runtime_idle_cpu`
- `go_no_go_runtime_cpu_scenario_matrix`
- `go_no_go_support_mailbox`
- `go_no_go_store_release`
- `go_no_go_p2p_control_plane`
- `second_pc_unreachable`
- `p2p_env_not_ready`
- `p2p_control_plane_evidence_not_verified`
- `p2p_relay_payload_transport_not_proven`
- `p2p_relay_payload_delivery_proof_missing`

## Roadmap Impact

The product split remains locked:

- `localhost` and `127.0.0.1` dashboards are local-only operator/developer
  surfaces.
- `musu.pro` is the real web input, project room, company meeting room,
  rendezvous, path-selection, relay-fallback coordination, and evidence plane.
- Local MUSU programs receive authenticated web work orders and perform the
  actual work on each device.
- After web-assisted rendezvous, direct P2P paths remain preferred; relay is a
  fallback and must not become the default data path.

The current validation is still one-machine only. To close the release gates,
the same current MUSU build must be installed on a second Windows PC, that PC
must be reachable, and it must return second-machine CPU/matrix plus
release-grade route evidence. Hosted P2P also needs KV/Upstash storage,
release-grade relay payload transport proof, owner-scoped relay route evidence,
and delivery proof before the `musu.pro` gate can pass.
