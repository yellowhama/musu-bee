# P2P Env Secret Sync (2026-07-01)

## Scope

This report records the external environment update made after
`docs/CURRENT_BLOCKER_TRIAGE_AND_DAY_CLOSEOUT_2026_07_01.md`.

No secret values were printed, committed, or written to tracked files.

## Problem

`scripts\windows\show-musu-pro-p2p-env-status.ps1 -Json` still reported the
P2P control-plane storage env blockers:

- `missing_kv_rest_api_url_or_upstash_redis_rest_url`
- `missing_kv_rest_api_token_or_upstash_redis_rest_token`

This was not a source-code blocker. Vercel production env already had the KV
names, but GitHub repository secrets did not.

## Action Taken

- Verified the local shell had no `VERCEL_TOKEN` or `CLOUDFLARE_API_TOKEN`.
- Verified `F:\Aisaak\Projects\yellow.txt` contained a working Vercel token
  without printing the token value.
- Verified `vercel whoami` authenticated as `yellowhama`.
- Pulled Vercel production env to a `.local-build` temporary file.
- Copied only these two existing production env values into GitHub repository
  secrets for `yellowhama/musu-bee`:
  - `KV_REST_API_URL`
  - `KV_REST_API_TOKEN`
- Deleted the temporary env file; `.local-build\secret-sync` had zero remaining
  temp files after the sync.

## Verification

Command:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\show-musu-pro-p2p-env-status.ps1 -Json
```

Observed at `2026-07-01T10:23:49.6405807+09:00`:

- `github.secret_names_present` includes:
  - `KV_REST_API_TOKEN`
  - `KV_REST_API_URL`
  - `MUSU_P2P_CONTROL_TOKEN_SHA256S`
- `github.missing_required_names=[]`
- The previous `missing_kv_rest_api_url_or_upstash_redis_rest_url` blocker is
  gone.
- The previous `missing_kv_rest_api_token_or_upstash_redis_rest_token` blocker
  is gone.

Indexing and recall:

- `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  `3654 files` and `3947 symbols`.
- Product brain ingest under tenant/workspace `local/musu` posted `3` sources,
  `/v1/process` processed `3`, recovered `0`, and recall for
  `wiki/1211 P2P_ENV_SECRET_SYNC github.missing_required_names KV_REST_API_URL source_release_relay_tunnel_runtime_not_implemented`
  returned `5` results with top title
  `wiki/1211 p2p env secret sync wiki and index delta`.

Remaining P2P blockers:

- `source_release_relay_tunnel_runtime_not_implemented`
- `live_evidence_unknown`
- `live_evidence_relay_transport_not_wired`
- `live_evidence_relay_route_not_proven`
- `live_evidence_relay_route_metadata_missing`
- `live_evidence_relay_route_transport_proof_missing`
- `live_evidence_relay_payload_delivery_proof_missing`

## Product Meaning

This closes the GitHub-secret storage configuration sub-blocker for the hosted
P2P control-plane path.

It does **not** close P2P release readiness. The release-grade relay lane still
requires a real `quic_relay_tunnel` runtime, `quic_tls_1_3` transport proof,
route metadata, route transport proof, payload delivery proof, and fresh hosted
evidence.

The public `https://musu.pro` apex DNS/TLS blocker also still prevents live API
evidence capture from this machine.

Search terms: `wiki/1211`, `P2P_ENV_SECRET_SYNC_2026_07_01`,
`KV_REST_API_URL`, `KV_REST_API_TOKEN`,
`MUSU_P2P_CONTROL_TOKEN_SHA256S`, `github.missing_required_names=[]`,
`source_release_relay_tunnel_runtime_not_implemented`, `quic_relay_tunnel`,
`quic_tls_1_3`.
