# 2026-06-01 16:36 KST - Relay Lease Audit CLI and Live Auth Blocker

Context:

- Operator asked whether the public site fix should be deployed to `musu.pro`.
- Site deployment was already complete through Vercel production workflow run
  `26738950440` for commit `04929fd Fix public site scroll and branding`.
- Live Playwright checks against `https://musu.pro` passed for `/`, `/landing`,
  `/pricing`, and `/install` on desktop/mobile: pages scroll, favicon logo and
  browser icon resolve to `/images/favicon-header.png`, and the brand emerald
  CSS variable is `#24C8DB`.

Relay audit work:

- Added `musu relay leases --json` as an operator-side diagnostic surface.
- The command queries `GET /api/v1/p2p/relay/lease` with optional
  `--session-id`, `--source-node-id`, `--target-node-id`, and bounded `--limit`.
- JSON schema is `musu.relay_leases.v1`.
- The report includes `owner_scope_verified` so a failed query cannot be
  mistaken for verified owner-scoped production evidence.
- `relay_transport_wired=false` and `relay_default_data_path=false` remain true
  product boundaries: this is audit/control-plane visibility, not payload relay.

Live blocker:

- `musu relay status --json` against default `https://musu.pro` reports
  `logged_in=true`, `relay_control_plane_lease_wired=true`, and
  `relay_runtime_fallback_lease_request_wired=true`.
- `musu relay leases --json` reaches production but fails with
  `p2p_control_auth_not_configured`.
- Current `musu.pro` P2P control routes still expect static env-token auth
  (`MUSU_P2P_CONTROL_TOKEN`, `MUSU_ROUTE_EVIDENCE_TOKEN`, or `MUSU_TOKEN`),
  while the Rust runtime sends the logged-in account token.

Decision:

- Do not claim production relay lease evidence yet.
- Next step is to fix production P2P control auth so the server validates the
  runtime account/device token or issues/verifies a scoped P2P control token.
- Only after that should a direct-route-failure run be used as release evidence
  for owner-scoped relay fallback evaluation on `musu.pro`.
