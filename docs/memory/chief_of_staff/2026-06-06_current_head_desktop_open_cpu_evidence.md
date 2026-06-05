# 2026-06-06 Current HEAD Desktop-Open CPU Evidence

Fresh `desktop-open` idle CPU evidence was captured on `HUGH_SECOND` for clean
HEAD `2387db2dea5fc983d0d3104b41037642b9939ccc`.

Evidence:

- `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260606-071122-HUGH_SECOND.desktop-open.evidence.json`

Result:

- `git_dirty=false`
- sample time `60.04s`
- hot process count `0`
- owned process count `8`
- MUSU runtime/shell `2`
- owned WebView2 helpers `6`
- owned Node helpers `0`
- total working set `363.83MB`
- total private memory `193.95MB`
- max one-core CPU by role: MUSU `0`, Node `0`, WebView2 `0.08`, other `0`

Audits passed:

- Rust background-loop contract: `ok=true`, `fail_count=0`
- frontend polling contract: `ok=true`, `fail_count=0`
- process ownership audit: `ok=true`, `fail_count=0`
- startup single-instance audit: `ok=true`, `fail_count=0`

Qualitative assessment:

- no high/medium code issue found
- no code changed for this evidence refresh
- local desktop-open runtime looks healthy on one machine
- this does not close second-PC or hosted MUSU.PRO P2P release gates

Product boundary:

- MUSU Desktop remains the local executor
- MUSU.PRO remains remote input, project/company room, presence, rendezvous,
  path-selection, relay-fallback, and evidence control plane
- direct P2P mesh remains preferred after web-assisted discovery

Canonical report:

- `docs\RELEASE_1_15_0_RC1_CURRENT_HEAD_DESKTOP_OPEN_CPU_EVIDENCE_2026_06_06.md`
