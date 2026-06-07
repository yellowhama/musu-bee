# 2026-06-07 KST - process, startup, and desktop single-instance recheck

Current packaged MUSU Desktop local runtime hardening was rechecked on
`HUGH_SECOND` at source commit `c9129327884eefe016e7776442a96d3eb8643831`.

Durable evidence was promoted:

- `docs\evidence\process-ownership\1.15.0-rc.1\20260607-115103-HUGH_SECOND.process-ownership.json`
- `docs\evidence\startup-single-instance\1.15.0-rc.1\20260607-115104-HUGH_SECOND.startup-single-instance.json`
- `docs\evidence\startup-single-instance\1.15.0-rc.1\20260607-115104-HUGH_SECOND.startup-single-instance.process-ownership.json`
- `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260607-115149-HUGH_SECOND.desktop-single-instance.json`

Audit results:

- process ownership `ok=true`, runtime `1`, desktop shell `1`, owned Node `0`,
  owned WebView2 `6`, orphan repo helpers `0`, bridge PID `34860`, bridge
  health HTTP `200`
- startup single-instance `ok=true`, three `musu up --json` invocations reused
  bridge PID `34860`, repeated spawn count `0`
- desktop single-instance `ok=true`, three AppUserModelId activations reused
  desktop PID `24144`, new desktop shell count `0`
- P2P store-forward relay contract `ok=true`, Rust background loop contract
  `ok=true`

Product decision:

- do not flip release relay markers to true while the active hosted relay
  payload path is still the preview store-forward queue or fail-closed
  preflight;
- local desktop hardening is currently healthy on one machine;
- public release still needs second-PC CPU/matrix/route evidence and hosted
  MUSU.PRO release-grade relay proof.

Search terms: `GOAL v792`, `wiki/967`, `process startup desktop
single-instance recheck`, `20260607-115103-HUGH_SECOND.process-ownership`,
`20260607-115104-HUGH_SECOND.startup-single-instance`,
`20260607-115149-HUGH_SECOND.desktop-single-instance`, `bridge PID 34860`,
`desktop PID 24144`, `owned WebView2 6`, `repeated_spawn_count 0`.
