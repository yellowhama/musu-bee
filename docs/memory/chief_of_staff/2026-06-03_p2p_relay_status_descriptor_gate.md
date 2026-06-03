# 2026-06-03 P2P Relay Status Descriptor Gate

`musu relay status --json` now queries the live relay transport descriptor and
mirrors preflight, descriptor, payload endpoint, lease store, blockers, and
error fields instead of hiding everything behind a hardcoded
`relay_transport_wired=false`.

The release verifier and go/no-go output now expose:

- `relay_status_transport_preflight_ok`
- `relay_status_transport_descriptor_wired`
- `relay_status_payload_endpoint_wired`
- `relay_transport_payload_endpoint_wired`

Validation passed release evidence verifier regressions `22/22`, `cargo check
--lib`, the targeted Rust relay status test `1/1`, `npm run test:p2p` `37/37`,
and `git diff --check`.

Dirty-tree go/no-go stays No-Go with primary runtime evidence still `1/2`,
`p2p_control_plane_verified=false`, and all new relay payload endpoint/proof
fields false. This is gate/reporting hardening only; relay payload transport
remains unimplemented and must not be inferred from env flags.
