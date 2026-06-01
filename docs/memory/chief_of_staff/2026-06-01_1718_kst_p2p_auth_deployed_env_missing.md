# 2026-06-01 17:18 KST - P2P Auth Code Deployed, Production Env Missing

Deployment:

- Commit `b1c4378 Allow hashed P2P control tokens` was pushed to `main`.
- GitHub `Tests` run `26742743243` passed.
- GitHub `E2E Tests — musu-bee` run `26742743299` passed.
- Vercel production deploy run `26742743319` passed.

Live check:

- `musu relay leases --json` against default `https://musu.pro` still returns
  `p2p_control_auth_not_configured`.
- The error body now includes `accepted_auth_modes=[]`.

Interpretation:

- The new `p2pControlAuth` code is live on `musu.pro`.
- Production has neither a raw P2P control token nor
  `MUSU_P2P_CONTROL_TOKEN_SHA256S` configured.
- Remaining action: set production `MUSU_P2P_CONTROL_TOKEN_SHA256S` using the
  value from `scripts\windows\show-p2p-control-token-hash.ps1 -Json`, then
  re-run `musu relay leases --json`.

Release impact:

- Relay lease production evidence remains blocked.
- This is now an environment/configuration blocker, not a missing-code blocker.
