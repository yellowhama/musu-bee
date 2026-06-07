# 2026-06-07 Current-HEAD CPU Matrix Goal Continuation

Current HEAD `f7f45922611e1986947053e94c3525d7b395eb8a` has a later
HUGH_SECOND packaged WindowsApps CPU matrix after the SaaS/AG UI research and
documentation refresh.

Evidence promoted under
`docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1`:

- `20260607-143513-HUGH_SECOND.current-head-target-route.runtime-cpu-scenario-matrix.json`
- `20260607-143513-HUGH_SECOND.current-head-target-route.runtime-cpu-scenario-matrix.verification.json`
- `20260607-143513-HUGH_SECOND.current-head-target-route.post-route-target.verification.json`
- startup-open/runtime-started/dashboard-open/desktop-open/post-route evidence
  JSON files with the same prefix

Result:

- full matrix verifier `ok=true`, `fail_count=0`
- post-route target verifier `ok=true`, `fail_count=0`
- `git_dirty=false`
- packaged WindowsApps MUSU command
- hot process count `0`
- MUSU CPU `0`
- Node CPU `0`
- highest owned WebView2 one-core CPU `0.10`
- owned WebView2 helper count `6`
- working set `370.10-371.04MB`

The targeted route probe still timed out to
`http://192.168.1.192:8949/api/tasks/delegate` with `ok=false`,
`failure_allowed=true`, `exit_code=1`, and target `HUGH-MAIN`.

Audits:

- P2P relay contract `ok=true`, `fail_count=0`
- Rust background-loop contract `ok=true`, `fail_count=0`
- frontend polling contract `ok=true`, `fail_count=0`
- process ownership `ok=true`, `fail_count=0`, packaged runtime `1`,
  packaged desktop `1`, owned Node `0`, owned WebView2 `6`

Interpretation:

- the reported 20% busy-loop did not reproduce on HUGH_SECOND/current HEAD;
- this is failed route-attempt CPU diagnostic evidence only;
- release remains No-Go until current second-PC CPU/matrix/route proof, live
  MUSU.PRO P2P/relay proof, support mailbox proof, and Store proof exist.

Search terms should include `current-head CPU matrix goal continuation`,
`20260607-143513-HUGH_SECOND`, `f7f45922`, `HUGH-MAIN timeout`,
`WebView2 max 0.10`, `MUSU CPU 0`, and `process ownership fail_count=0`.
