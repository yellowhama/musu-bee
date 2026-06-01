# 2026-06-01 14:45 KST - Post Dashboard-Open Gate Current Evidence

After committing the dashboard-open CPU matrix gate tightening, current primary
evidence was refreshed.

Single-machine smoke:

- Evidence: `docs\evidence\single-machine\1.15.0-rc.1\20260601-144154-HUGH_SECOND.evidence.json`
- Verification: `docs\evidence\single-machine\1.15.0-rc.1\20260601-144154-HUGH_SECOND.verification.json`
- Dashboard output: `MUSU_RELEASE_SMOKE_OK_20260601_144129`
- Dashboard task: `a55012e1-adab-48e6-950f-e6953cd1566b`
- Bridge: `http://127.0.0.1:2502`
- CLI route checked: `true`
- Evidence SHA-256: `2dc3311862fc4ea4f76b92df0592d1db8ddd9b2641a81b7552b138ec9e846c1f`
- Verification SHA-256: `06766b45a72efcb291ede7bef7e22901a19b9d01d06f0821a42ea608548b5977`

Primary packaged desktop-open CPU:

- Evidence: `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260601-144311-HUGH_SECOND.desktop-open.evidence.json`
- Source commit: `aeb6c10d366b9759773bea5491604f79a594d81a`
- Sample: 60.029s
- Processes: one `musu-desktop`, six owned WebView2 helpers, owned Node `0`
- Max one-core CPU: `musu=0`, `webview2=0.18`
- Memory: working set `341.41MB`, private memory `183.8MB`

Current release implication:

- Primary single-machine and primary desktop-open CPU gates are current again.
- Public release still needs second-PC desktop-open CPU evidence, clean/current
  two-machine CPU scenario matrix evidence, real QUIC/TLS multi-device route
  evidence, `musu@musu.pro` inbox evidence, and Store evidence.
