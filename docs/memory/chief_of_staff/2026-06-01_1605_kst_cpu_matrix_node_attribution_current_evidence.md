# CoS Memory - CPU Matrix Node Attribution and Current Evidence

Date: 2026-06-01 16:05 KST

Durable update:

- Public `musu.pro` scroll/logo/accent fix was already deployed through the existing Vercel `main` workflow; live QA passed for `/`, `/landing`, `/pricing`, and `/install`.
- `measure-musu-idle-cpu.ps1` now uses command-line metadata to classify repo-related Node.js processes. This fixes the blind spot where `node.exe` showed only `C:\Program Files\nodejs\node.exe` and was missed even when running the local Next dashboard.
- `measure-musu-runtime-cpu-scenarios.ps1` now uses only a real dashboard `reachable_url` unless an explicit `-DashboardUrl` is supplied; it no longer falls back to non-reachable `dev_url`/`start_url`.
- Current primary 4-state CPU matrix evidence passes:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260601-154503-HUGH_SECOND.runtime-cpu-scenario-matrix.json`.
  It covers `runtime-started`, `dashboard-open`, `desktop-open`, and `post-route`, includes repo Node `1`, and has no hot processes.
- Current single-machine smoke evidence passes:
  `docs\evidence\single-machine\1.15.0-rc.1\20260601-155630-HUGH_SECOND.evidence.json`.
- Current primary `desktop-open` runtime-idle CPU evidence passes:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260601-160102-HUGH_SECOND.desktop-open.evidence.json`.
  Counts: MUSU `2`, repo Node `1`, owned WebView2 `6`; max one-core CPU `musu=0`, `node=0`, `webview2=0.08`; working set `504.02MB`.
- Go/no-go remains No-Go: single-machine, public metadata, MSIX install, and MSIX desktop-entrypoint pass, but runtime idle CPU is `1/2`, runtime CPU scenario matrix is `1/2`, and real multi-device route, support inbox, and Store approval evidence remain missing.

Next:

- Run the second-PC wrapper again and import the return zip so both `runtime-idle-cpu` and `runtime-cpu-scenarios` reach `2/2`.
- Finish real route proof with release-grade QUIC/TLS transport verification and peer identity proof.
- Record `musu@musu.pro` inbox delivery evidence and Partner Center/Microsoft Store evidence.
