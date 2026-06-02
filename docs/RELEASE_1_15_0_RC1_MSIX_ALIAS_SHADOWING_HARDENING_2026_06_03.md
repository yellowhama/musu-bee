# MUSU 1.15.0-rc.1 MSIX Alias Shadowing Hardening

Date: 2026-06-03 04:25 KST

## Summary

The MSIX release tooling now distinguishes true PATH alias shadowing from other
visible `musu.exe` binaries. A path is a release blocker only when it resolves
before the packaged WindowsApps execution alias.

This corrected the current release status shape:

- `local_artifacts_ready=True`
- `runtime_package_ready=True`
- `msix_install_verified=True`
- `msix_desktop_entrypoint_verified=True`
- `single_machine_verified=True`

The current developer machine still has a real shadowing condition:

- first alias path: `C:\Users\empty\.cargo\bin\musu.exe`
- packaged alias path:
  `C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe`
- explicit packaged invocation:
  `& "C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe"`

That is now reported as an operator environment remediation item instead of a
runtime package artifact failure.

## Code Audit

Changed scripts:

- `scripts\windows\msix-common.ps1`
- `scripts\windows\check-msix-legacy-conflicts.ps1`
- `scripts\windows\capture-msix-install-evidence.ps1`
- `scripts\windows\verify-installed-msix-package.ps1`
- `scripts\windows\write-release-go-no-go.ps1`
- `scripts\windows\verify-single-machine-evidence.ps1`
- `scripts\windows\verify-runtime-cpu-scenario-matrix.ps1`

The common conflict detector now records:

- `AliasSources`
- `WindowsAppsAliasPresent`
- `WindowsAppsAliasDiscovered`
- `FirstAliasPath`
- `AlternateAliasSources`
- `AliasShadowing`

`AliasShadowing` contains only the first executable when it appears before the
WindowsApps alias. Alternate binaries later in PATH are recorded for operator
visibility but no longer counted as shadowing.

The evidence capture now includes:

- `windowsapps_alias_invocation`
- `alias_resolution_order`
- `alternate_alias_count`
- `alternate_alias_sources`
- `alias_remediation`

The freshness allowlist now treats these MSIX evidence/status scripts as
tooling-only changes, so current runtime evidence is not invalidated by this
non-runtime hardening.

## Validation

- `check-msix-legacy-conflicts.ps1 -Json`: parsed successfully and reports
  `alias_shadowing_count=1`, `first_alias_path=C:\Users\empty\.cargo\bin\musu.exe`.
- `verify-installed-msix-package.ps1`: package, manifest, Start menu entry,
  alias contract, and artifact contract match all pass; warning remains for the
  local PATH alias order.
- `capture-msix-install-evidence.ps1 -Json`: records the new alias fields and
  fails only on the expected local alias shadowing checks.
- `audit-desktop-release-readiness.ps1 -Json`: `runtime_package_ready=True`,
  `desktop_shell_ready=True`, `single_machine_verified=True`; only stale
  multi-device evidence remains in that audit.
- `write-release-go-no-go.ps1 -ScriptTimeoutSeconds 120`: public release remains
  No-Go, but `local_artifacts_ready=True` and the `runtime-package` blocker is
  gone. The temporary `git` blocker exists because this report was generated
  before commit.
- `git diff --check`: passed.

## Qualitative Status

Primary-machine evidence still does not reproduce the user's reported
20%-of-one-core MUSU-owned busy loop. The latest desktop-open evidence remains:
MUSU `0`, Node `0.03`, WebView2 `0.6`, working set `500.44MB`, hot `0`.

Current product completeness is roughly:

- local desktop/MSIX/startup/single-instance/process ownership: release-candidate
  quality
- busy-loop hardening: primary PC passes, second-PC proof still required
- `musu.pro` P2P control-plane: implemented enough to test, still blocked on
  live KV/Upstash owner-scoped relay lease evidence
- public Store readiness: blocked on operator/Partner Center evidence, not on
  current local package shape

## Remaining Work

The public desktop release remains blocked by:

- second-PC clean/current MSIX install and multi-device route evidence
- second-PC runtime idle CPU and four-scenario CPU matrix evidence
- live `https://musu.pro` P2P control-plane evidence with owner-scoped relay
  leases and `relay_default_data_path=false`
- `musu@musu.pro` mailbox delivery evidence
- Partner Center product reservation, app submission, Microsoft certification,
  and restricted capability approval evidence

Estimated remaining work:

- local docs/index/commit/push: under 1 hour
- second-PC evidence if the machine is reachable: 1-2 hours
- `musu.pro` P2P production storage/control-plane proof if credentials are
  ready: 1-3 hours
- support mailbox proof: 15-30 minutes
- Partner Center submission prep: 1-2 hours, with Microsoft certification time
  outside local control
