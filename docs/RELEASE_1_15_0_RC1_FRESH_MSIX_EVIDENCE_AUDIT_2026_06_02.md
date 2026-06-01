# MUSU 1.15.0-rc.1 Fresh MSIX Evidence Audit

**Wiki ID**: wiki/533
**Date**: 2026-06-02
**Scope**: fresh release MSIX build/install, packaged desktop repeated activation, single-machine smoke, runtime CPU evidence, process ownership, qualitative status, code audit, and next release steps after commit `2e97d135538f063252577c49762f8018bc366843`.

## Verdict

MUSU remains **No-Go for public desktop release**.

The fresh local-sideload MSIX does close an important internal blocker on the primary Windows machine: repeated Start-menu/AppsFolder activation no longer creates duplicate `musu-desktop.exe` shells. Primary single-machine smoke, desktop-open idle CPU, the four-state runtime CPU matrix, and process ownership also pass on `HUGH_SECOND`.

This does not close public release. The remaining blockers are still second-PC CPU/matrix evidence, real release-grade multi-device route evidence, live `musu.pro` P2P control-plane auth evidence, `musu@musu.pro` support inbox delivery evidence, and Partner Center/Store evidence.

## Fresh Package Evidence

Fresh package build/install:

- Build command: `scripts\windows\run-msix-workflow.ps1 -Configuration release -StartupContract local-sideload-manual -SkipSmoke`
- Build mitigation: `CARGO_BUILD_JOBS=1`
- MSIX: `.local-build\msix\output\musu_1.15.0.0_x64_local-sideload-manual.msix`
- Installed package: `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`
- AppUserModelId: `Yellowhama.MUSU_ygcjq669as2b6!MUSU`
- Entrypoint contract: `musu-desktop.exe` as the desktop app, `musu.exe` as CLI alias, `musu-startup.exe` as startup task
- Known warning: `C:\Users\empty\.cargo\bin\musu.exe` still shadows the WindowsApps alias in `PATH`; the WindowsApps alias was verified directly.

The earlier local release-build OOM/pagefile blocker is no longer current for this machine. The successful release build compiled the Tauri shell with `tauri-plugin-single-instance v2.4.2`.

## Evidence Recorded

| Gate | Current evidence | Result |
|---|---|---|
| Desktop repeated activation | `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260602-014803-HUGH_SECOND.evidence.json` | Pass: 3 activations, one desktop shell |
| Single-machine smoke | `docs\evidence\single-machine\1.15.0-rc.1\20260602-015347-HUGH_SECOND.evidence.json` | Pass: dashboard task `3e96b141-6aa5-4d39-a29b-450f15eed8b3`, bridge `http://127.0.0.1:6907`, CLI route checked |
| Desktop-open CPU | `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260602-015358-HUGH_SECOND.desktop-open.evidence.json` | Pass: 60.055s, MUSU `2`, hot process count `0`, max one-core CPU `musu=0.03`, `node=0.68`, `webview2=0.7`, working set `537.79MB` |
| Four-state CPU matrix | `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260602-015510-HUGH_SECOND.runtime-cpu-scenario-matrix.json` | Pass: `runtime-started`, `dashboard-open`, `desktop-open`, `post-route`, route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_015510` |
| Process ownership | `docs\evidence\process-ownership\1.15.0-rc.1\20260602-020031-HUGH_SECOND.evidence.json` | Pass: one runtime, one desktop shell, owned Node `0`, owned WebView2 `6`, orphan repo helpers `0`, bridge `/health` HTTP 200 |

Important comparison:

- Old installed package failed desktop repeated activation: one existing shell expanded to four shells after three activations.
- Fresh installed package passes: baseline `0`, after `1`, new shell count `1`, and every activation reused PID `32232`.

## Qualitative Evaluation

Current qualitative completion:

- Single-machine Windows beta: **good enough for controlled beta**.
- Desktop packaging quality: **materially improved** because the desktop app now launches the right binary and repeated activation is gated and passing on the primary machine.
- Runtime idle quality on primary: **not reproducing the reported busy-loop** under current evidence. CPU stays under the 5%-of-one-logical-core budget in desktop-open and all matrix states.
- Multi-device public promise: **not ready**. There is no current two-machine route proof with peer identity, QUIC/TLS transport proof, and payload transit truth.
- `musu.pro` network role: **partly implemented, not production-verified**. Registry/rendezvous/route-evidence/relay-lease policy wiring exists, but live relay lease auth is still blocked by missing production scoped auth.
- Store readiness: **operationally close but evidence-incomplete**. Package generation and local install are working; Partner Center reservation/submission/certification evidence is not recorded.

The product should still be described as a Store-candidate desktop launcher/status shell for the MUSU runtime and dashboard handoff, not as a complete native dashboard.

## Code Audit

Findings:

1. **Fixed on primary package:** packaged desktop repeated activation no longer spawns duplicate desktop shells after the fresh MSIX install.
2. **No current primary busy-loop evidence:** desktop-open and matrix samples on `HUGH_SECOND` have no hot processes. The separate second-PC evidence remains required because the operator observed the issue on more than one machine.
3. **Node.js count is explained, not ignored:** process ownership evidence recorded 18 machine-wide Node processes, but MUSU-owned Node is `0` and orphan repo helpers are `0`. Machine-wide Node remains diagnostic only.
4. **Direct PowerShell piping of packaged `musu up --json` can still hang in manual use:** the smoke/matrix harnesses use temp-file capture to avoid inherited output handle hangs. This is a known Windows harness/runtime edge and should remain on the hardening list.
5. **Live `musu.pro` still needs production configuration:** the code path for SHA-256 token allowlisting exists, but the production env must be set and verified before hosted relay lease evidence can pass.
6. **No public Store claim is evidence-backed yet:** Store approval, restricted capability approval, support inbox, and live production P2P evidence remain explicit gates.

## Product Spec Updates

1. Fresh local-sideload MSIX on primary is now the current desktop evidence baseline.
2. Packaged desktop repeated activation is a permanent release gate through `musu.desktop_single_instance_audit.v1`.
3. Primary desktop-open CPU evidence is valid only when paired with process ownership and desktop single-instance evidence from the same source-fresh package line.
4. `musu.pro` website deploy is complete for the scroll/logo/accent issue. The remaining `musu.pro` work is not a web UI deploy; it is production P2P control-plane env/auth verification.
5. The public release path remains Store-first. Do not publish the fresh local-sideload MSIX as a general download unless it is intentionally positioned as an operator/test build.

## Next Steps

P0 release gates:

1. Run the same fresh MSIX install and desktop single-instance audit on the second PC.
2. Capture second-PC `desktop-open` CPU evidence and four-state runtime CPU matrix evidence from the fresh package.
3. Capture real second-PC multi-device route evidence with release-grade `quic_tls_1_3` transport proof, peer identity proof, handshake timing, and payload transit truth.
4. Configure production `MUSU_P2P_CONTROL_TOKEN_SHA256S` or equivalent scoped auth on live `musu.pro`, redeploy/reload production if needed, then record passing P2P control-plane evidence without `-AllowUnverified`.
5. Send and verify the current `musu@musu.pro` support mailbox token.
6. Reserve/confirm the Partner Center product, submit the Store-reviewed package, and record certification/restricted-capability evidence.

P1 hardening:

- Replace or harden manual CLI piping behavior so `musu up --json` cannot hang a caller when a child bridge inherits stdout/stderr handles.
- Add a queued-task/backlog CPU scenario to verify the writer `Notify` change under load.
- Keep mDNS, clipboard sync, file sync, and planner off by default for Store-candidate evidence unless each path has its own resource/privacy proof.

Current decision: **No-Go until P0 evidence passes on two machines and live external gates are recorded.**
