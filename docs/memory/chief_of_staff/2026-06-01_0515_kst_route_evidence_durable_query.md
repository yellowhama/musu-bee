# 2026-06-01 05:15 KST - Route evidence durable query API

- `POST /api/v1/p2p/route-evidence` now stores accepted
  `musu.route_evidence.v1` records and returns `stored=true` with
  `evidence_id`.
- `GET /api/v1/p2p/route-evidence` returns stored records with filters:
  `limit`, `source_node_id`, `target_node_id`, `route_kind`, `result`, and
  `release_grade`.
- Hosted storage uses Vercel KV/Upstash Redis list operations (`lpush`,
  `ltrim`, `lrange`) to avoid read-modify-write loss. Local/dev uses an atomic
  JSON file fallback at `MUSU_ROUTE_EVIDENCE_STORE_PATH`.
- Production storage fails closed without `KV_REST_API_URL` and
  `KV_REST_API_TOKEN` unless an explicit persistent file path is configured.
- This advances `musu.pro` control-plane evidence from "receiver stub" to
  "stored/queryable audit surface", but it still does not satisfy public route
  proof because current route attempts lack peer identity verification and
  QUIC/TLS encryption proof.
- Validation passed: `npx tsx --test src/app/api/v1/p2p/route-evidence/route.test.ts`,
  `npm run typecheck`, `git diff --check`, and indexer sync
  `1063 files / 1997 symbols`.
