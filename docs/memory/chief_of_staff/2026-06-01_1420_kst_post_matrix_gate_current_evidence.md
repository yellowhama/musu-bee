# 2026-06-01 14:20 KST - Post Matrix-Gate Current Evidence

After committing the runtime CPU scenario matrix release gate, prior
single-machine and primary CPU evidence became stale because the gate change was
a non-documentation script change. Evidence was refreshed on `HUGH_SECOND`.

Current evidence:

- Single-machine smoke:
  `docs/evidence/single-machine/1.15.0-rc.1/20260601-141622-HUGH_SECOND.evidence.json`
  passed with dashboard output `MUSU_RELEASE_SMOKE_OK_20260601_141601`,
  CLI route checked, dashboard task `ab8b05fd-3a66-47c4-9f88-d151e1056b29`,
  and bridge `http://127.0.0.1:7328`.
- Primary packaged desktop-open CPU:
  `docs/evidence/runtime-idle-cpu/1.15.0-rc.1/20260601-141730-HUGH_SECOND.desktop-open.evidence.json`
  passed from clean commit `668362afe47b7e78985dd12e22a5fb9cbde3bb0b`
  with 60.027s sample, two MUSU processes, six owned WebView2 helpers,
  owned Node `0`, max one-core CPU `musu=0`, `webview2=0.16`, working set
  `374.19MB`, and private memory `183.35MB`.

Go/no-go implication:

Primary local evidence should return to `single_machine_verified=true` and
runtime idle CPU `1/2` after these docs/evidence files are committed. Public
release remains No-Go until second-PC desktop-open CPU, two-machine scenario
matrix evidence, real QUIC/TLS route proof, `musu@musu.pro` support inbox
evidence, and Store evidence are recorded.
