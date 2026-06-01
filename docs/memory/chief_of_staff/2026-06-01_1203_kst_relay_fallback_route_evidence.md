# 2026-06-01 12:03 KST - Relay Fallback Route Evidence Persistence

## Durable Update

Failed runtime bridge forwarding now records the relay fallback evaluation inside `musu.route_evidence.v1` as optional `relay_fallback`.

The addendum records:

- `direct_path_failed`
- `lease_requested`
- fallback `status`: `skipped_no_token`, `skipped_no_session`, `denied`, `issued`, `failed`, or `timed_out`
- `lease_issued`
- `attempted_route_kinds`
- `requested_capability`
- `policy`
- `blockers`
- optional `lease_id`
- relay `failure_class`

This changes the product spec from "runtime calls relay lease endpoint after direct failure" to "runtime calls the endpoint and persists the fallback decision with the route evidence." It is still not relay payload transport. `musu relay status --json` remains `relay_transport_wired=false` and `relay_default_data_path=false`.

## Validation

- `cargo fmt --manifest-path .\musu-rs\Cargo.toml --check`
- `cargo test --manifest-path .\musu-rs\Cargo.toml -j 1 --lib route_evidence -- --nocapture`
- `cargo test --manifest-path .\musu-rs\Cargo.toml -j 1 --lib bridge::rendezvous::tests::relay_lease_request_records_failed_direct_paths_without_using_relay_as_default -- --nocapture`
- `cargo build --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1`
- `npx tsx --test src/app/api/v1/p2p/route-evidence/route.test.ts`
- `npm run typecheck`
- `musu relay status --json`

## Remaining No-Go

Public release still requires clean two-machine desktop-open CPU evidence, real second-PC route proof, `musu@musu.pro` delivery evidence, Store/Partner Center evidence, QUIC/TLS route proof, and explicit relay/tunnel transport before any payload can use relay.
