# Chief of Staff Memory: Relay Route Query Delivery Proof Hardening

Date: 2026-06-05T05:16+09:00

Decision:

- Release-grade relay route evidence queries now revalidate current relay
  fallback, transport proof, and payload delivery proof shape.
- Stale stored relay records with `release_grade=true` and transport proof only
  are excluded from `release_grade=true` query results.
- The P2P store-forward relay contract audit now gates this behavior.

Validation:

- `npm run test:p2p` passed `79/79`.
- `npm run typecheck` passed.
- PowerShell parser passed for the updated audit script.
- `audit-p2p-store-forward-relay-contract.ps1 -Json` passed with `ok=true`,
  `fail_count=0`, and the new
  `release-grade query revalidates relay delivery proof` check.
- `git diff --check` passed.

Release status:

- This hardens the evidence chain but does not close hosted P2P.
- Remaining P2P blockers are release tunnel source markers, production
  KV/Upstash, live relay lease evidence, relay transport proof, relay route
  proof, and live payload delivery proof.
