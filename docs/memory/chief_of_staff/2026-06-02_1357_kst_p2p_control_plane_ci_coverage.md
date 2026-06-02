# 2026-06-02 13:57 KST - P2P Control-Plane CI Coverage

Current HEAD had P2P route tests for route evidence, rendezvous, and relay
leases, but the web CI lane only ran the operator API route tests.

Change recorded:

- Added `npm run test:p2p` in `musu-bee/package.json`.
- Added GitHub Actions step `P2P control-plane tests` after
  `Route security tests`.
- Updated release docs and wiki as wiki/551.

Validation:

- `npm run test:p2p`: 21/21 passed.
- `npm run test:routes`: 12/12 passed.
- `git diff --check`: passed.

Release interpretation:

- This closes the local code-audit gap where release-critical P2P route
  contracts were not enforced by CI.
- This does not close the live P2P release gate. Production still needs
  `KV_REST_API_URL` and `KV_REST_API_TOKEN` on `musu.pro`, plus fresh
  owner-scoped control-plane evidence.
