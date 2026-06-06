# CoS Memory: Idle CPU 4-State Recheck

Date: 2026-06-06

Local CPU recheck was run on `HUGH_SECOND` from repo HEAD
`e0474473e366f847f24bd77ec862c5a72f02e59b`.

- Matrix path:
  `.local-build\runtime-cpu-scenarios\20260606-190449-HUGH_SECOND\20260606-190449-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- Scenarios: `startup-open`, `runtime-started`, `dashboard-open`,
  `desktop-open`
- Result: `ok=true`, `git_dirty=false`, `fail_count=0`
- Hot processes: `0` in all four scenarios
- Max CPU: MUSU `0%`, Node `0%`, WebView2 up to `0.16%`
- Working set: about `123 MB`
- Owned process set: bridge runtime `1`, desktop shell `1`, owned Node `0`,
  owned WebView2 `6`

Frontend polling audit passed with `ok=true`, `fail_count=0`, 29 low-duty
polling call-site files, zero direct intervals, and zero direct visibility
listeners.

Rust background-loop audit passed with `ok=true`, `fail_count=0`, zero
unaudited loops, zero unaudited spawns, and no background telemetry flush worker
primitive.

This does not close full release CPU gates. Full release verification still
requires `post-route` and second-PC evidence. The installed WindowsApps package
also does not expose a build commit or the new `stale_bridge_registry_*` fields,
so this should not be treated as proof that the crash-recovery source change is
installed.
