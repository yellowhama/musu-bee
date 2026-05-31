# CoS Memory Note — Token-Owner Scoped Route Evidence

Date: 2026-06-01 08:15 KST

Durable decision: the current `musu.pro` P2P route-evidence API must not behave as one shared bucket. Until real account auth maps Bearer tokens to account ids, the stub stores and queries route evidence under a token-derived owner key.

Implementation facts:

- `p2pControlAuth.ts` derives `owner_key=token-sha256:<hex>` from the accepted Bearer token.
- `routeEvidenceStore.ts` stores `owner_key` with each evidence record.
- `POST /api/v1/p2p/route-evidence` returns `owner_scoped=true`.
- `GET /api/v1/p2p/route-evidence` filters records by the caller's token-derived owner key.
- API responses omit `owner_key`, so the linkage hash is not exposed to callers.
- Tests now prove that evidence written under one Bearer token is not returned to another Bearer token.

Release implication: this improves the control-plane security model and closes the shared-storage leakage gap for the current stub. It does not close public release readiness: real account-id mapping, evidence UI/export, retention policy, real second-PC route proof, QUIC/TLS route proof, relay fallback, two-machine CPU evidence, support inbox evidence, and Store evidence remain open.
