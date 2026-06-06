# MUSU 1.15.0-rc.1 Idle CPU 4-State Recheck

Date: 2026-06-06
Branch: `harden-relay-fallback-payload-evidence`
HEAD while measured: `e0474473e366f847f24bd77ec862c5a72f02e59b`

## Summary

The current local WindowsApps MUSU package was sampled for four 60-second
runtime states on `HUGH_SECOND`:

- `startup-open`
- `runtime-started`
- `dashboard-open`
- `desktop-open`

The matrix reports `ok=true`, `git_dirty=false`, `sample_seconds=60`, and
`fail_count=0`.

Evidence path:

- `.local-build\runtime-cpu-scenarios\20260606-190449-HUGH_SECOND\20260606-190449-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

This is a current one-machine runtime CPU recheck. It is not full public release
CPU evidence because the release verifier still requires `post-route` and a
second machine.

## CPU Result

| Scenario | Hot processes | MUSU max | Node max | WebView2 max | Bridge max | Desktop max | Working set |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `startup-open` | 0 | 0% | 0% | 0.05% | 0% | 0% | 123.33 MB |
| `runtime-started` | 0 | 0% | 0% | 0.08% | 0% | 0% | 123.35 MB |
| `dashboard-open` | 0 | 0% | 0% | 0.03% | 0% | 0% | 123.42 MB |
| `desktop-open` | 0 | 0% | 0% | 0.16% | 0% | 0% | 123.32 MB |

Each scenario observed 8 owned target processes: one bridge runtime, one desktop
shell, zero owned Node helpers, and six owned WebView2 helpers.

## Attribution

Process ownership audit passed:

- schema: `musu.process_ownership_audit.v1`
- `ok=true`
- `fail_count=0`
- packaged runtime process count: `1`
- desktop shell process count: `1`
- owned Node helper count: `0`
- owned WebView2 helper count: `6`
- bridge registry PID: `37928`
- bridge health: HTTP `200` at `127.0.0.1:4751`

Machine-wide Node/WebView2 processes were present, but they were not owned by
MUSU and were excluded from MUSU runtime CPU attribution.

## Loop Candidate Audit

Frontend polling contract passed:

- schema: `musu.frontend_polling_contract.v1`
- `ok=true`
- `fail_count=0`
- low-duty polling call-site files: `29`
- low-duty polling signal gaps: `0`
- direct interval hits: `0`
- direct visibility listener hits: `0`

Rust background loop contract passed:

- schema: `musu.rust_background_loop_contract.v1`
- `ok=true`
- `fail_count=0`
- unaudited Rust loop hits: `0`
- unaudited spawn hits: `0`
- telemetry flush background worker primitives: `0`
- filesystem watcher primitives: allowlisted only
- network watcher primitives: allowlisted only

This means the currently audited source keeps clipboard sync, mDNS discovery,
relay payload polling, and planner loops behind opt-in gates or low-duty
cadences. The local CPU sample did not reproduce a 20% idle busy loop.

## Verification Split

The full release matrix verifier intentionally fails when run with its default
requirements against this four-state matrix because `post-route` is missing.

Default verifier failure:

- `scenario 'post-route' is missing`
- `post-route matrix lacks a route probe`

Local four-state verification passes when scoped to the four measured states:

```powershell
& .\scripts\windows\verify-runtime-cpu-scenario-matrix.ps1 `
  -EvidencePath .local-build\runtime-cpu-scenarios\20260606-190449-HUGH_SECOND\20260606-190449-HUGH_SECOND.runtime-cpu-scenario-matrix.json `
  -RequiredScenarios @('startup-open','runtime-started','dashboard-open','desktop-open') `
  -RequirePostRouteProbe:$false `
  -Json
```

Result: `ok=true`, `fail_count=0`.

## Packaging Note

`musu --version` reports `musu 1.15.0-rc.1`, but the installed WindowsApps
runtime does not expose a build commit. Also, `musu up --json` from the installed
package does not yet include the newly added source fields
`stale_bridge_registry_removed` and `stale_bridge_registry_pid`.

Therefore this CPU recheck proves current installed release-identity runtime
resource behavior only. It must not be used as proof that the crash-recovery
source change has been rebuilt into the installed package.

## Next Work

1. Rebuild and reinstall the WindowsApps package from a commit that includes the
   crash-recovery gate.
2. Re-run strict MSIX install, single-machine, desktop-open CPU, and full runtime
   CPU matrix evidence from that package.
3. Re-run `post-route` with a real second Windows PC route target. The goal
   remains two machines under 5% of one logical core for the required states.
