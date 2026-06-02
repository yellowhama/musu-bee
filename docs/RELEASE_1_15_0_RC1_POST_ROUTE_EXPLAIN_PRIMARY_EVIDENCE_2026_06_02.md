# MUSU 1.15.0-rc.1 Post Route-Explain Primary Evidence

Recorded: 2026-06-02 22:56 KST  
Source commit: `9302589745165c56010773a30bb5d5fa2c778cca`

## Scope

This report records the packaged primary evidence refresh after route-explain
trust-boundary hardening. The source change prevents `musu route --explain`
from presenting registry/rendezvous metadata as verified identity or
release-grade encryption before runtime transport proof exists.

## Evidence

The local-sideload MSIX was rebuilt and installed as
`Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`.

- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260602-224345-HUGH_SECOND.evidence.json`
- desktop single-instance:
  `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260602-223734-HUGH_SECOND.desktop-single-instance.json`
- process ownership:
  `docs\evidence\process-ownership\1.15.0-rc.1\20260602-223756-HUGH_SECOND.process-ownership.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260602-223806-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU scenario matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260602-224917-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

## Result

Primary packaged evidence is restored for commit `93025897`.

- single-machine smoke passed through dashboard task
  `51661bb8-5bfb-4d82-8c01-b4a455356c34`, bridge
  `http://127.0.0.1:2785`, and CLI route smoke.
- repeated desktop activation passed: repeat count `3`, before desktop shell
  `0`, after desktop shell `1`, new desktop shell `1`, final desktop PID
  `22312`.
- process ownership passed: runtime `1`, desktop shell `1`, MUSU-owned Node
  `0`, MUSU-owned WebView2 `6`, machine-wide Node `16`, orphan repo helpers
  `0`, bridge health HTTP `200`.
- desktop-open CPU passed: 60.068s, MUSU `0`, Node `0`, WebView2 `0.39`,
  working set `365.49MB`, private memory `187.6MB`, hot process count `0`.
- runtime CPU matrix passed from clean git state with route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_224917`.
  `runtime-started`, `dashboard-open`, `desktop-open`, and `post-route` all
  stayed below the 5 percent one-core CPU budget with no hot processes.

The observed machine-wide Node count is not treated as MUSU ownership. The
process audit separated unrelated machine-wide Node processes from MUSU-owned
helpers; MUSU-owned Node was `0` in packaged desktop process ownership and
desktop-open idle CPU evidence. The runtime matrix had one repo/dashboard Node
for the test dashboard, which is expected for that scenario.

## Qualitative Assessment

Current local desktop completeness is materially better than the earlier
busy-loop report:

- the packaged desktop starts once and reuses the same shell on repeated
  activation;
- the bridge is owned by the installed package path, not by the developer
  alias;
- idle CPU is quiet in desktop-open and post-route states;
- evidence now distinguishes MUSU-owned helpers from unrelated Node/WebView2
  processes;
- `musu route --explain` no longer overstates route identity/encryption.

The product is still not ready for public desktop release. The current
evidence proves local single-machine operation and local CPU behavior on
`HUGH_SECOND`; it does not prove two-machine route reliability, release-grade
transport security, production relay lease owner scope, support mailbox
delivery, or Store submission readiness.

## Code Audit

No new critical local desktop issue was found in this pass.

Known risk that remains intentionally fail-closed:

- route explain is a preflight diagnostic, not route proof;
- direct route evidence still reports `encryption=none_http_bearer` until
  real QUIC/TLS or equivalent runtime transport proof is implemented;
- hosted P2P relay lease evidence still fails because production KV is not
  configured;
- second-PC evidence is stale/unavailable because the prior
  `192.168.1.192:8949` target is unreachable;
- support mailbox evidence must use `musu@musu.pro`, not `support@musu.pro`;
- Partner Center/Store evidence is still missing.

## Product Spec Updates

Current product contract:

- `musu.pro` is the account, rendezvous, relay lease, and control-plane
  surface.
- `musu.pro` is not the default payload data path.
- Store/public copy may describe assisted setup and control-plane routing, but
  must not claim release-grade P2P encryption or verified peer identity until
  runtime route evidence proves it.
- Route explain can show advertised fingerprint material as available, but
  must keep identity and encryption unverified until execution evidence proves
  the transport.

## Next Roadmap

1. Provision production P2P KV/Redis on `musu.pro`, set
   `KV_REST_API_URL` and `KV_REST_API_TOKEN`, redeploy, then rerun
   `record-p2p-control-plane-evidence.ps1` without unverified allowances.
2. Bring the second PC back online or import a fresh return zip, then capture
   two-machine CPU, matrix, and route proof from both machines.
3. Implement release-grade direct route transport proof: QUIC/TLS 1.3 or
   equivalent peer identity, peer public key, handshake timing, encryption
   field, and payload transit truth.
4. Capture `musu@musu.pro` receive/forward evidence and record it through the
   support mailbox verifier.
5. Prepare Microsoft Store evidence only after local package, two-machine
   route, P2P control plane, and support evidence are passing.

## Current Verdict

Public release remains No-Go.

Local artifacts are good enough to keep iterating, but release readiness is
blocked on external/proof gates: second-PC, P2P KV/owner scope, release-grade
route transport, support mailbox, and Store evidence.
