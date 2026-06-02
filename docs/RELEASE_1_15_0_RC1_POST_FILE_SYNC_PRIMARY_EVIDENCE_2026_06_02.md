# MUSU 1.15.0-rc.1 Post File-Sync Primary Evidence Audit

Date: 2026-06-02 17:22 KST

Source commit under test: `62381f7feec64ff5c6b17cd689b8729197e3a98e`

## Summary

After the file sync watcher storm hardening landed, the primary Windows desktop
evidence was refreshed from a fresh release MSIX build/install on `HUGH_SECOND`.
The local desktop/package path is again healthy for the primary machine:

- MSIX release build and local sideload install completed successfully.
- Packaged `musu.exe up --json` reached bridge health at `http://127.0.0.1:8155`.
- Single-machine dashboard and CLI route smoke passed.
- Desktop repeated activation stayed single-instance.
- Process ownership passed with one runtime, one desktop shell, zero MUSU-owned
  Node helpers, and seven MUSU-owned WebView2 helpers.
- `desktop-open` CPU and the four-state runtime CPU matrix both passed the
  5%-of-one-core release budget.

Public desktop release remains **No-Go**. The primary machine is current again,
but the release still needs second-PC CPU/matrix/route evidence, live
`musu.pro` owner-scoped P2P control-plane evidence, `musu@musu.pro` mailbox
evidence, and Store/Partner Center evidence.

## Evidence

Fresh primary evidence:

- desktop single-instance:
  `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260602-171500-HUGH_SECOND.desktop-single-instance.json`
- process ownership:
  `docs\evidence\process-ownership\1.15.0-rc.1\20260602-171500-HUGH_SECOND.process-ownership.json`
- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260602-171420-HUGH_SECOND.evidence.json`
- single-machine verification:
  `docs\evidence\single-machine\1.15.0-rc.1\20260602-171420-HUGH_SECOND.verification.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260602-171538-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU scenario matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260602-171659-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- runtime matrix per-scenario evidence:
  `20260602-171659-HUGH_SECOND.runtime-started.evidence.json`,
  `20260602-171659-HUGH_SECOND.dashboard-open.evidence.json`,
  `20260602-171659-HUGH_SECOND.desktop-open.evidence.json`, and
  `20260602-171659-HUGH_SECOND.post-route.evidence.json`

Single-machine smoke:

- dashboard task id: `60884022-fa9f-4e81-b0fc-775045bb63d0`
- bridge URL: `http://127.0.0.1:8155`
- CLI route checked: `true`
- evidence SHA-256:
  `484471449bac6b01b65ccde9c9648d50039d1bba39e325222c18273a7916cbdf`
- verification SHA-256:
  `3eec2b80803c3472139587a674579008ab5377c1c1385a484db6b6eaf4b77f47`

Process ownership:

- MUSU runtime: `1`
- desktop shell: `1`
- MUSU-owned Node helpers: `0`
- MUSU-owned WebView2 helpers: `7`
- machine-wide Node processes observed: `18`
- machine-wide WebView2 processes observed: `13`
- orphan repo helpers: `0`

Desktop-open CPU:

- sample: `60.048s`
- process counts: MUSU `2`, repo Node `1`, WebView2 `6`
- max one-core CPU: MUSU `0`, repo Node `0.03`, WebView2 `0.57`
- total working set: `496.62MB`
- hot process count: `0`

Runtime CPU scenario matrix:

- route token: `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_171659`
- `runtime-started`: MUSU `0`, WebView2 `0.29`, hot `0`
- `dashboard-open`: MUSU `0`, Node `0.03`, WebView2 `0.18`, hot `0`
- `desktop-open`: MUSU `0`, Node `0.03`, WebView2 `0.34`, hot `0`
- `post-route`: MUSU `0`, Node `0.05`, WebView2 `0.05`, hot `0`

## Qualitative Assessment

The current primary desktop build is good enough for continued beta/operator
use on `HUGH_SECOND`. It is not yet good enough for a public desktop release.

The operator-reported busy-loop pattern is **not reproduced** in the current
primary packaged evidence. MUSU runtime CPU stayed at `0` in desktop-open and
all matrix scenarios. WebView2 stayed well under the 5%-of-one-core budget.

The "many Node.js processes" observation is real on this machine, but current
process attribution says those are not MUSU-owned helpers. MUSU-owned Node
helpers are `0`; the only Node included in CPU evidence is the temporary
production Next server started for local dashboard smoke collection.

Current product readiness:

- primary packaged Windows beta: strong
- local single-machine workflow: strong
- desktop idle resource behavior on primary: strong
- two-machine release proof: not ready
- `musu.pro` assisted P2P/control plane: not ready until KV-backed live
  owner-scoped evidence passes
- Store release: not ready until external release evidence exists

## Code Audit Notes

No new code defect was found in this evidence refresh.

The latest source hardening is meaningful: `musu-rs/src/install/sync.rs` now
uses a bounded watcher queue, bounded batch windows, same-path coalescing, and
pressure yield. That removes another optional background-worker storm candidate.

Remaining known risks:

- `HUGH_SECOND` still has developer PATH shadowing:
  `C:\Users\empty\.cargo\bin\musu.exe` precedes the packaged WindowsApps alias.
  Evidence collection must keep using the explicit WindowsApps alias.
- Second-PC route evidence remains stale/failing and does not prove
  release-grade peer identity, QUIC/TLS transport, or payload transit truth.
- Runtime CPU and runtime matrix gates require two machines; the primary now
  contributes `1/2`, not `2/2`.
- The live `musu.pro` P2P control-plane still needs production KV/Upstash
  backing before owner-scoped evidence can pass.
- `musu@musu.pro` mailbox and Store/Partner Center evidence are still missing.

## Next Steps

1. Run the current second-PC action pack on the second Windows PC and import the
   returned zip with release-gate evidence required.
2. Provision production KV/Upstash for the `musu.pro` P2P control-plane and
   rerun live owner-scoped route/relay evidence.
3. Record `musu@musu.pro` support mailbox evidence with the current verification
   token.
4. Prepare Store submission only with current evidence-backed claims.
5. After the evidence/docs commit, rerun clean go/no-go and keep
   `ready_for_public_desktop_release=false` until all external gates are closed.
