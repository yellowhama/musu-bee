# Chief of Staff Memory: P2P Store-Forward Relay Contract Gate

Date: 2026-06-05T03:55+09:00

Decision:

- Keep local MUSU programs and `musu.pro` separate.
- Local MUSU programs execute work on each device.
- `musu.pro` handles remote user input, project/company rooms, presence,
  rendezvous, path selection, relay fallback policy, and evidence.
- Web-assisted rendezvous may bootstrap device connection; after that the
  preferred data path is P2P mesh.
- Relay remains fallback-only, not the default data path.

Implemented:

- Added `audit-p2p-store-forward-relay-contract.ps1`.
- Wired it into go/no-go, desktop release readiness, and final handoff status.
- Synced the single-machine and runtime CPU matrix verifier status-only
  freshness allowlists so audit/docs-only gate changes do not stale packaged
  runtime evidence.
- Go/no-go now reports `p2p_store_forward_relay_contract_verified`.
- The audit currently passes with `ok=true`, `fail_count=0`.

Current status:

- Store-forward relay queue fallback source contract is proven.
- Release-grade relay tunnel/connect payload transport remains unwired.
- `show-musu-pro-p2p-env-status.ps1` still reports `ok=false` with missing
  KV/Upstash, release relay endpoint, route evidence, and delivery proof
  blockers.
- Public release remains No-Go.

Next:

- Commit this source/doc gate.
- Continue with production P2P control-plane evidence only after KV/Upstash and
  release tunnel endpoints are ready.
- Multi-device proof still requires installing the current build on another PC.
