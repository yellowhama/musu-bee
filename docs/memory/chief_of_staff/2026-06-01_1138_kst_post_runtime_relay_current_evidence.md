# CoS Memory - Post Runtime Relay Current Evidence

Date: 2026-06-01 11:38 KST

After commit `52698c4406de4747b4e1ce1834cfbad1cb0c75c1` (`Wire runtime relay fallback lease request`), current local evidence was refreshed.

- Primary packaged `desktop-open` CPU evidence: `docs/evidence/runtime-idle-cpu/1.15.0-rc.1/20260601-113022-HUGH_SECOND.desktop-open.evidence.json`
- CPU result: `ok=true`, `git_dirty=false`, 60.029s, one `musu-desktop`, six owned WebView2 helpers, owned Node `0`, max one-core CPU `musu=0` and `webview2=0.16`, total working set `343.16MB`, private memory `182.96MB`, SHA-256 `15b663f4a0059a6d4620fc17c8bfaa5a7111e7eab806ff6a3173de72b3ed7f72`
- Single-machine smoke evidence: `docs/evidence/single-machine/1.15.0-rc.1/20260601-113438-HUGH_SECOND.evidence.json`
- Smoke result: dashboard output `MUSU_RELEASE_SMOKE_OK_20260601_113412`, CLI route checked, dashboard task `7527eda1-b7f6-4a0d-8447-b17e76e756fe`, bridge `http://127.0.0.1:1473`, evidence SHA-256 `4ddb66e16f4714f0ea40e4d6dc3c436e713bc6434be713433f9d26e67768f2e5`, verification SHA-256 `3561358fc9fd767237a5a738a829ea384040e90de39d490407b65a50c68e83cf`

This keeps HUGH_SECOND current after the relay fallback wiring commit. Public desktop release still needs second-PC desktop-open CPU evidence, real second-PC route evidence, `musu@musu.pro` inbox proof, and Partner Center/Store evidence.
