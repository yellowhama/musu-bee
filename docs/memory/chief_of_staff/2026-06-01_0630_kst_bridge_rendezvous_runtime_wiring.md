# 2026-06-01 06:30 KST — Bridge Rendezvous Runtime Wiring

Durable memory:

- `musu.pro` rendezvous moved from server-only API to first bridge runtime use.
- `musu-rs/src/bridge/rendezvous.rs` now owns the bounded lifecycle:
  create/refresh session, publish source candidates, let target publish
  candidates when it receives the forwarded task, and close after terminal
  success/failure.
- Forwarded tasks now carry optional `rendezvous_session_id` and
  `rendezvous_target_node_id`; the latter lets a target publish candidates
  using the node id the source placed in the session, including manual-address
  fallback cases.
- If the refreshed session already includes target endpoint candidates, source
  forwarding now selects the best non-relay candidate by LAN -> Tailscale ->
  direct-public priority and sends the task to that route peer. If that
  candidate is stale/failing, forwarding falls back once to the original
  selected peer.
- Runtime route evidence records `session_id` when the session was created, so
  local evidence and `musu.pro` route-evidence submissions can be joined to a
  control-plane session.
- The control-plane rendezvous store now caches recent node candidate sets when
  `/candidates` is called, and new rendezvous sessions seed source/target
  candidate sets from that cache when available.
- `MUSU_P2P_RENDEZVOUS_CLIENT_TIMEOUT_MS` defaults to `3000`, clamps to
  `250..10000`, and fails open to the selected direct peer path on timeout or
  cloud failure.
- `musu relay status --json` and `musu route --explain --json` now report
  `rendezvous_session_wired=true`.
- This is not release-grade routing yet: payload transport is still legacy
  HTTP bearer, peer identity/QUIC-TLS proof is absent, relay fallback is absent,
  and real second-PC target-candidate-assisted route evidence is still required.
