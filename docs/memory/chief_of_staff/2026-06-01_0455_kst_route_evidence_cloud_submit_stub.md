# 2026-06-01 04:55 KST - Route evidence cloud submit stub

- Operator-supplied mDNS logs remain classified as a real Windows/Tailscale
  idle/log-noise risk: default source should not touch Tailscale IPv6 mDNS
  unless `MUSU_ENABLE_MDNS=1`, `MUSU_MDNS_ENABLE_IPV6=1`, or
  `MUSU_MDNS_ENABLE_TAILSCALE=1` is explicitly set.
- `musu-bee` now has authenticated `POST /api/v1/p2p/route-evidence`.
  The endpoint validates `musu.route_evidence.v1`, returns `release_grade` and
  `blockers`, and intentionally reports `stored=false` until durable storage is
  added.
- Server-side route-evidence auth uses `MUSU_P2P_CONTROL_TOKEN`, then
  `MUSU_ROUTE_EVIDENCE_TOKEN`, then `MUSU_TOKEN`.
- Rust runtime forwarding now writes the local
  `~/.musu/route-evidence/<task_id>.route-evidence.json` file first, then
  starts a background best-effort submit of the same evidence to the cloud DTO
  path when `~/.musu/token` exists. Submission failure does not fail or delay
  the operator task.
- `MUSU_CLOUD_BASE_URL` now overrides cloud client base URL for login,
  registry, and route-evidence tests; default remains `https://musu.pro`.
- Public release remains No-Go: the current transport still records
  `peer_identity_verified=false` and `encryption=none_http_bearer`, so route
  evidence is observable but not release-grade until rendezvous, peer identity,
  QUIC/TLS proof, durable storage, and relay truth are implemented.
- Validation passed: `npx tsx --test src/app/api/v1/p2p/route-evidence/route.test.ts`,
  `npm run typecheck`, `cargo check --manifest-path .\musu-rs\Cargo.toml -j 1`,
  `cargo test --manifest-path .\musu-rs\Cargo.toml -j 1 --lib route_evidence -- --nocapture`,
  targeted rustfmt on changed Rust files, and
  `cargo fmt --manifest-path .\musu-rs\Cargo.toml --check`.
