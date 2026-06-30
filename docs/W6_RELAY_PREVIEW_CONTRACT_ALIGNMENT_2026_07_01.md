# W6 Relay Preview Contract Alignment (2026-07-01)

## Verdict

W6 remains a hermetic preview relay fallback regression. It is not release-grade
relay transport proof.

## What Changed

- `musu-rs/tests/w6_relay_roundtrip.rs` no longer describes the scenario as the
  product thesis "relay works without Tailscale".
- The mock cloud payload, claim, and delivery records now report
  `transport_kind=http_store_forward_preview`.
- The mock lease and relay payload metadata now report
  `relay_default_data_path=false`.
- The mock release-grade marker stays false and now names
  `relay_payload_queue_not_quic_tls_transport` as the blocker.

`store_forward_queue` remains a preview lease intent vocabulary elsewhere. The
payload transport vocabulary for this test is now explicitly
`http_store_forward_preview` so it cannot be confused with future
`quic_relay_tunnel` release transport.

## Findings

| Severity | Issue | Evidence | Impact | Next |
|---|---|---|---|---|
| NO-GO | Full relay transport is still not release-ready. | Current go/no-go still includes `relay-transport`; release runtime remains `release_relay_tunnel_runtime_implemented=false`; W6 is a mock store-forward fallback test. | MUSU still cannot claim delegated work routes over release-grade relay when direct routing is blocked. | Implement real `quic_relay_tunnel`, bind transport proof to route evidence, and run a direct-blocked two-PC proof. |
| HIGH | The previous W6 mock language and metadata could be misread as default relay data path proof. | Prior mock values used `relay_default_data_path=true` and `transport_kind=store_forward_queue` while `release_grade=false`. | A future audit could overclaim the preview queue as product relay completion. | Keep W6 scoped to preview fallback and require release transport proof for the product blocker. |
| MED | The W6 integration target was not completed in this run. | Full `cargo test --test w6_relay_roundtrip` and the exact mock-contract test both stalled during the test target compile and were killed. | The edited contract is source-reviewed and nearby relay tests pass, but W6 itself is not counted as fresh execution evidence today. | Investigate W6 compile/runtime cost separately before using it as release evidence. |
| INFO | Public metadata remains an external DNS/TLS blocker, not an app-route code blocker. | `https://www.musu.pro/*` redirects to apex and apex `https://musu.pro/*` fails; existing DNS repair evidence records Cloudflare/Vercel mismatch. | Store/public readiness cannot be closed from repo code alone. | Fix apex DNS/TLS/provider state, then rerun `verify-store-public-metadata.ps1`. |

## Verification

- `rustfmt --edition 2021 --check musu-rs\tests\w6_relay_roundtrip.rs` passed.
- `powershell -File scripts\windows\audit-p2p-store-forward-relay-contract.ps1
  -Json` returned `ok=true`, `fail_count=0`.
- `cargo test --manifest-path musu-rs\Cargo.toml --lib
  release_relay_tunnel_submission_contract_is_release_grade_and_fail_closed --
  --nocapture` passed `1/1`.
- `cargo test --manifest-path musu-rs\Cargo.toml --lib relay_payload --
  --nocapture` passed `34/34`.
- `npm --prefix musu-bee run test:p2p` passed `133/133`.

## Indexing

- `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
  indexed `3561 files` and `3908 symbols`.
- `musu indexer search --work-dir F:\workspace\musu-bee --query
  "http_store_forward_preview"` returns this report and
  `musu-rs/tests/w6_relay_roundtrip.rs`.
- Product brain source ingest under `tenant_id=local`, `workspace_id=musu`
  created 3 sources for this report, the wiki entry, and the roadmap snippet.
- `/v1/process` processed 3 new sources with `recovered=0`.
- `/v1/query` for
  `wiki/1199 http_store_forward_preview relay_payload_queue_not_quic_tls_transport`
  returned 3 results with top title
  `wiki/1199 W6 relay preview contract alignment report`.

Not counted as passing evidence:

- `cargo test --manifest-path musu-rs\Cargo.toml --test w6_relay_roundtrip --
  --nocapture` stalled during compile for more than three minutes and was
  killed.
- `cargo test --manifest-path musu-rs\Cargo.toml --test w6_relay_roundtrip
  w6_mock_rendezvous_json_matches_cloud_contract -- --exact --nocapture`
  stalled during compile and was killed.

## Product Meaning

This closes an overclaim risk in the W6 mock contract. It does not close the
release relay blocker.

The product remains NO-GO until the real release relay path produces:

- `quic_relay_tunnel` byte transit;
- `musu.relay_transport_proof.v1`;
- `musu.route_evidence.v1` with relay proof attached;
- `musu.relay_payload_delivery_proof.v1`;
- direct-blocked two-PC physical proof.
