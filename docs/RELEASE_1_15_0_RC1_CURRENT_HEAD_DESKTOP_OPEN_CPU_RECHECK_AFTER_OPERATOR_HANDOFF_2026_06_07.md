# Release 1.15.0-rc.1 Current-Head Desktop-Open CPU Recheck After Operator Handoff

**Wiki ID**: wiki/953
**Generated**: 2026-06-07 KST
**Evidence source commit**: `059b947437231f0f1319e16f4d728115b402d020`

## Summary

After the current operator handoff documentation landed, a fresh 60s
desktop-open idle CPU sample was captured on `HUGH_SECOND` from a clean source
tree at commit `059b947437231f0f1319e16f4d728115b402d020`.

This is a local packaged MUSU Desktop evidence refresh. It does not change
runtime source, hosted P2P code, release transport, or the product boundary.

## Evidence

New evidence file:

- `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260607-102745-HUGH_SECOND.desktop-open.evidence.json`

Capture command:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/windows/measure-musu-idle-cpu.ps1 `
  -SampleSeconds 60 `
  -Scenario desktop-open `
  -IncludeNode `
  -IncludeWebView2 `
  -RequireOwnedWebView2 `
  -FailOnHot `
  -OutputPath docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260607-102745-HUGH_SECOND.desktop-open.evidence.json `
  -Json
```

Key result:

- `ok=true`
- `git_dirty=false`
- scenario: `desktop-open`
- sample duration: `60.039s`
- bridge registry PID: `34860`
- bridge address: `127.0.0.1:14361`
- MUSU processes after sample: `2`
- process roles: MUSU `2`, Node `0`, owned WebView2 `6`, other `0`
- process subroles: bridge runtime `1`, desktop shell `1`, WebView2 helpers
  `6`, Node helper `0`
- hot processes: `0`
- resource budget violations: `0`
- max one-core CPU by role: MUSU `0`, Node `0`, WebView2 `0.08`
- max one-core CPU by subrole: bridge runtime `0`, desktop shell `0`,
  WebView2 helper `0.08`
- total working set after sample: `363.16MB`
- total private memory after sample: `191.70MB`
- attribution sample count: `8`
- required roles present: MUSU and WebView2
- required subroles present: bridge runtime, desktop shell, WebView2 helper

## Code Audit

No runtime or application source code changed in this step. The only new
artifact is the official idle CPU evidence JSON plus this documentation update.

Audit interpretation:

- no high or medium code issue found;
- no new polling loop, background watcher, relay path, local API surface, or
  hosted P2P trust boundary was introduced;
- the evidence was captured from a clean source tree, so `git_dirty=false`
  correctly reflects the runtime source under test;
- after this documentation/evidence commit, the final operator packet and
  action pack should be regenerated once more from the final committed HEAD so
  their local metadata matches the repository tip.

## Product Boundary

This recheck reinforces the current product split:

- MUSU Desktop is the local packaged executor on each device.
- MUSU.PRO is the remote input, project/company room, AI meeting room,
  presence, rendezvous, path selection, relay fallback, and evidence/control
  plane.
- `localhost:3001` is not the packaged desktop release contract.
- A browser connection failure to a developer dashboard does not mean the
  installed local MUSU Desktop runtime is down.
- Actual work must remain on local MUSU programs; MUSU.PRO may coordinate,
  authenticate, route, and record proof.

## Release Meaning

The one-machine local desktop CPU gate remains healthy on `HUGH_SECOND`.

This does not close public release because the release still needs:

- second-PC desktop-open idle CPU evidence;
- second-PC five-state runtime CPU matrix evidence;
- real second-PC multi-device route evidence;
- live hosted MUSU.PRO runtime login and owner-scoped storage;
- release `quic_relay_tunnel` transport proof;
- release payload delivery proof;
- support mailbox delivery proof;
- Store/Partner Center evidence.

## Next Steps

1. Commit this evidence and documentation.
2. Refresh the MUSU local index.
3. Regenerate final operator gate packet and operator action pack from the final
   committed HEAD.
4. Move the regenerated second-PC transfer zip to the other Windows machine and
   run the packaged evidence kit there.
5. Import the return zip on `HUGH_SECOND`, then rerun clean go/no-go.
6. Continue hosted MUSU.PRO P2P work only as control-plane/rendezvous/relay
   fallback proof, not as cloud execution.

## Index Refresh

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- indexed files: `2891`
- indexed symbols: `2790`
- duration: `15617 ms`
- wiki: `wiki/954`
