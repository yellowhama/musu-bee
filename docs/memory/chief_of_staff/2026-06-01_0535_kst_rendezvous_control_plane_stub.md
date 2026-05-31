# 2026-06-01 05:35 KST - Rendezvous control-plane stub

- Added authenticated `musu.pro` rendezvous endpoints in `musu-bee`:
  `POST /api/v1/p2p/rendezvous`, `GET /api/v1/p2p/rendezvous/:id`,
  `POST /api/v1/p2p/rendezvous/:id/candidates`,
  `POST /api/v1/p2p/rendezvous/:id/approve`, and
  `POST /api/v1/p2p/rendezvous/:id/close`.
- Sessions are short-lived and store source/target candidate sets, relay
  capability, public key, capabilities, approval state, and close state.
- Hosted storage uses Vercel KV per-session keys. Local/dev uses
  `MUSU_P2P_RENDEZVOUS_STORE_PATH`. Production fails closed without KV unless an
  explicit persistent file path is configured.
- This is server-side candidate exchange only. Bridge runtime still reports
  `rendezvous_session_wired=false` until route attempts create/read these
  sessions before selecting LAN/Tailscale/direct/relay candidates.
- Validation passed: `npx tsx --test src/app/api/v1/p2p/rendezvous/route.test.ts src/app/api/v1/p2p/route-evidence/route.test.ts`,
  `npm run typecheck`, `git diff --check`, and indexer sync
  `1072 files / 2034 symbols`.
