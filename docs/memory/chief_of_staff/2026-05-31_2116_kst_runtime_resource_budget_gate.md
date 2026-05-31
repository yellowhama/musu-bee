# Chief of Staff Memory - Runtime Resource Budget Gate

Date: 2026-05-31 21:16 KST

- `scripts\windows\measure-musu-idle-cpu.ps1` now records `scenario`, `git_commit`, `git_dirty`, owned process count budget, owned WebView2 budget, total working set budget, total/private memory, memory totals by role, and `resource_budget_violations`.
- `scripts\windows\write-release-go-no-go.ps1` now requires runtime CPU evidence to be `desktop-open` with `-RequireOwnedWebView2`; bridge-only evidence cannot satisfy public release.
- Clean bridge-only diagnostic evidence passed at `docs\evidence\runtime-idle-cpu-diagnostic\1.15.0-rc.1\20260531-211448-HUGH_SECOND.bridge-only.evidence.json`: one MUSU runtime, zero owned Node/WebView2, max one-core CPU `0.03%`, total working set `27.7MB`.
- Desktop-open diagnostic attempt was recorded at `docs\evidence\runtime-idle-cpu-diagnostic\1.15.0-rc.1\20260531-211608-HUGH_SECOND.desktop-open-attempt.evidence.json` and correctly failed because `-RequireOwnedWebView2` found zero MUSU-owned WebView2 processes after MSIX app activation.
- Public runtime CPU/resource gate remains No-Go until both PCs produce 60s `desktop-open -RequireOwnedWebView2` samples under the CPU, process count, WebView2 count, and memory budgets.
