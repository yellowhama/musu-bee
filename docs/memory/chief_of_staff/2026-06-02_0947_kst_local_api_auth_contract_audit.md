# CoS Memory - Local API auth contract audit

Date: 2026-06-02 09:47 KST

Decision:

- Rust bridge localhost API requests require `Authorization: Bearer <MUSU_BRIDGE_TOKEN>` by default.
- `MUSU_BRIDGE_LOCALHOST_AUTH=0` / `false` / `no` is the only explicit trusted local dev bypass.
- Do not document `MUSU_BRIDGE_LOCALHOST_AUTH=1` as the way to require localhost auth; that is stale Python-era guidance.

Work completed:

- Added `scripts/windows/audit-local-api-auth-contract.ps1` with schema `musu.local_api_auth_contract.v1`.
- Fixed current-facing stale docs in API, architecture, config, getting started, manual, production, and troubleshooting docs.
- Wired the audit into release readiness tooling, final operator packet copy/verification, and evidence freshness allowlists.
- Validation passed: `ok=true`, `fail_count=0`, `stale_doc_hit_count=0`.

Release impact:

- Security/doc handoff quality improved.
- Runtime code did not need a change.
- Public desktop release remains No-Go until second-PC CPU/matrix/route, live `musu.pro` P2P control-plane, `musu@musu.pro`, and Store evidence are recorded.

Search terms:

- wiki/543
- musu.local_api_auth_contract.v1
- audit-local-api-auth-contract.ps1
- MUSU_BRIDGE_LOCALHOST_AUTH=0
- localhost auth required by default
