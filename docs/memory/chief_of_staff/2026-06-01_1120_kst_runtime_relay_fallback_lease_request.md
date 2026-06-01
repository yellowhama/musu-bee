# CoS Memory - Runtime Relay Fallback Lease Request

Date: 2026-06-01 11:20 KST

Runtime bridge forwarding now requests a fail-closed relay lease after terminal direct-route failure when a rendezvous session and account token exist. The request is built in `musu-rs/src/bridge/rendezvous.rs` from source node, target node, attempted direct route kinds, `direct_path_failed=true`, failure class, and requested capability. `forward_to_peer_with_retry` calls it before closing the rendezvous session after all direct attempts fail.

This does not wire relay payload transport. `musu relay status --json` now exposes `relay_runtime_fallback_lease_request_wired=true` while keeping `relay_transport_wired=false` and `relay_default_data_path=false`. Denied, timed-out, missing-token, or missing-session lease outcomes preserve the original direct-route failure.

Validation passed locally with targeted rendezvous relay-request tests, relay lease serialization test, `cargo fmt --check`, `cargo build --bin musu -j 1`, and relay status JSON. Next evidence step is a live logged-in direct-route-failure run that proves the runtime requested a lease without using relay as the default payload path.
