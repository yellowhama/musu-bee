# MUSU 1.15.0-rc.1 Next Steps After Post Room-Control CPU Audit

Date: 2026-06-06

## Current Known State

- MUSU Desktop is installed and running as the packaged local executor on
  `HUGH_SECOND`.
- Current clean HEAD is `ade5b64f012c14a8de6f2c0fa99065de5db45f64`.
- Fresh local CPU evidence passes:
  `20260606-080201-HUGH_SECOND.desktop-open`.
- Fresh process ownership evidence passes:
  `20260606-080350-HUGH_SECOND.process-ownership`.
- Rust background-loop, frontend polling, P2P relay contract, and process
  ownership audits pass.
- The local busy-loop report is not reproduced on the sampled machine.
- Public release is still No-Go because one-machine evidence is not enough.

## Product Boundary To Preserve

- MUSU Desktop executes work locally on each device.
- MUSU.PRO receives remote user input, hosts rooms/meetings, exchanges
  presence/rendezvous/path-selection metadata, and records evidence.
- MUSU.PRO helps local programs find each other; after bootstrap, direct P2P
  mesh is preferred.
- Hosted relay is fallback-only and must not become the default execution or
  payload path.

## Release Completion Plan

1. Second PC install
   - Install the same current MUSU build on the second Windows PC.
   - Confirm the packaged runtime identity and no repo/debug runtime is active.

2. Second PC local gates
   - Run single-machine smoke.
   - Capture `desktop-open` idle CPU evidence for 60s.
   - Capture five-state runtime CPU scenario matrix evidence.
   - Verify process metadata scope is
     `musu_process_tree_or_repo_related`.

3. Two-machine route gate
   - Run the two-machine route evidence flow.
   - Prefer successful direct P2P route proof.
   - If route fails, capture explicit route explanation and CPU stability
     evidence, but do not count it as route success.

4. Hosted MUSU.PRO P2P gate
   - Configure scoped production P2P control auth.
   - Configure production KV/Upstash relay lease storage.
   - Capture live owner-scoped P2P control-plane evidence without
     `-AllowUnverified`.
   - Keep the store-forward queue separate from release tunnel proof.

5. Release relay tunnel gate
   - Implement the distinct release tunnel payload path.
   - Keep release kind `quic_relay_tunnel`.
   - Emit `quic_tls_1_3` transport proof only from actual payload transit.
   - Verify relay evidence cannot pass via websocket queue fallback.

6. Final public release gates
   - Re-run go/no-go without `-SkipPublicMetadata`.
   - Capture support mailbox proof.
   - Capture Partner Center / Microsoft Store proof.
   - Regenerate final operator packet/action pack after all external gates
     are current.

## Stop Conditions

- Do not claim public release readiness with only HUGH_SECOND evidence.
- Do not treat the optional developer dashboard URL as the packaged local
  runtime.
- Do not route work payload bytes through MUSU.PRO rendezvous, presence, or
  route-evidence APIs.
- Do not treat store-forward queue delivery proof as release tunnel proof.
