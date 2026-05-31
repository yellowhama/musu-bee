# 2026-05-31 20:15 KST - Process Ownership Audit Gate

Durable memory:

- Operator concern: the machine showed many Node.js/WebView2 processes, and MUSU must not be allowed to hide a busy-loop or duplicate runtime behind machine-wide process noise.
- New release evidence script: `scripts\windows\audit-musu-process-ownership.ps1`.
- Evidence schema: `musu.process_ownership_audit.v1`.
- Go/no-go field: `process_ownership_verified`.
- Final handoff status and final operator packet verification now include the process ownership gate.
- Current local audit on `HUGH_SECOND` passed at `.local-build\process-ownership\musu-process-ownership-20260531-201339.json`.
- Observed counts: `musu_runtime=1`, `owned_node=0`, `owned_webview2=0`, `machine_wide_node=1`, `machine_wide_webview2=13`, `orphan_repo_helpers=0`.
- Bridge registry `C:\Users\empty\.musu\services\bridge.json` pointed to live `musu.exe` PID 31208, and bridge `/health` returned HTTP 200.
- Interpretation: visible machine-wide WebView2/Node inventory is diagnostic only. MUSU release responsibility is based on owned descendants, repo-related orphan helpers, live bridge registry PID, and bridge health.
- Remaining public-release blockers still include two-machine packaged desktop/WebView2 idle CPU evidence, real multi-device route evidence, `musu@musu.pro` inbox delivery evidence, and Partner Center/Microsoft Store approval evidence.
