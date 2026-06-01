# Chief of Staff Memory: Post Second-PC Matrix Current Evidence

- Date: 2026-06-01 10:54 KST
- Repo: `F:\workspace\musu-bee`
- Branch: `main`
- Source commit: `04d1ab13f1960d9f7adb5fb2d389ccd39c63923d`

## What Changed

- Refreshed release evidence after the `Wire second-PC CPU scenario matrix returns` commit.
- Reclassified the operator-supplied mDNS/Tailscale IPv6 log as the already-known Windows `ff02::fb%9:5353`/`os error 10065` failure class. Current source defaults keep bridge mDNS, IPv6 mDNS, Tailscale mDNS, and common VPN/virtual mDNS interfaces disabled unless explicitly opted in.
- Confirmed the machine-wide Node count during this run was not ten stale Node workers; before starting Next dev there was one Node process, and the release CPU sampler attributed owned Node count as `0`.

## Evidence

- Primary packaged desktop-open CPU evidence: `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260601-104726-HUGH_SECOND.desktop-open.evidence.json`
  - `ok=true`, `git_dirty=false`, sample `60.022s`
  - one `musu-desktop`
  - owned WebView2 `6`
  - owned Node `0`
  - max one-core CPU: `musu=0`, `webview2=0.18`
  - total working set `341.1MB`
  - SHA-256 `fa62a7b93b0475e8b59c89fbe8bdb9c907e6dfd1f94aa2c7ad34e4bde633346c`
- Single-machine smoke evidence: `docs\evidence\single-machine\1.15.0-rc.1\20260601-105019-HUGH_SECOND.evidence.json`
  - dashboard output `MUSU_RELEASE_SMOKE_OK_20260601_104959`
  - CLI output `MUSU_CLI_ROUTE_OK_20260601_104959`
  - dashboard task `e2f4b35b-7b79-4621-abbc-658413665d0b`
  - bridge `http://127.0.0.1:4980`
  - evidence SHA-256 `0b14f1e429b81a3b765b8ad6695a4bd02ce3685094ff127eda94af07a8ec66b8`
  - verification SHA-256 `3a1fbfe7a38949b088004dbf9a2f1ea6a0cacdbe8a69e95ebadd74002429ee08`

## Release State

- Local single-machine path is current again on `04d1ab1`.
- Runtime CPU gate is still `1/2`: `HUGH_SECOND` is valid, but second-PC desktop-open evidence is still missing.
- Public desktop release remains No-Go until real second-PC route evidence, second-PC CPU evidence, `musu@musu.pro` inbox proof, and Partner Center/Store evidence are recorded.
