# 2026-06-01 17:10 KST - P2P Control Auth Hash Allowlist

Context:

- Live `musu relay leases --json` reached `https://musu.pro` but failed with
  `p2p_control_auth_not_configured`.
- Root cause: Rust `MusuCloud` sends the logged-in account token from
  `~/.musu/token`, while the hosted P2P routes only accepted raw static env
  control tokens.

Change:

- `musu-bee/src/lib/p2pControlAuth.ts` now accepts:
  - raw `MUSU_P2P_CONTROL_TOKEN`
  - fallback raw `MUSU_ROUTE_EVIDENCE_TOKEN`
  - fallback raw `MUSU_TOKEN`
  - SHA-256 allowlist `MUSU_P2P_CONTROL_TOKEN_SHA256S`
  - single-hash alias `MUSU_P2P_CONTROL_TOKEN_SHA256`
- Hash allowlist values may be comma/space/semicolon-separated and may be bare
  hex or `sha256:<hex>`.
- Comparisons use timing-safe equality.
- `owner_key` remains derived from the presented Bearer token hash, keeping
  route evidence and relay leases token-owner scoped.

Operator helper:

- Added `scripts\windows\show-p2p-control-token-hash.ps1`.
- It reads `~\.musu\token` by default and prints only
  `MUSU_P2P_CONTROL_TOKEN_SHA256S=sha256:<hash>`.
- It does not print the raw account token.

Validation:

- Targeted P2P tests passed: rendezvous, route evidence, relay lease, and
  `p2pControlAuth.test.ts` hash allowlist cases.
- `npm run typecheck` passed.
- The hash helper was smoke-tested with a fake token.

Still required:

- Deploy the `musu-bee/**` change to production.
- Configure production `MUSU_P2P_CONTROL_TOKEN_SHA256S`.
- Re-run `musu relay leases --json` and require an owner-scoped response before
  claiming production relay lease evidence.
