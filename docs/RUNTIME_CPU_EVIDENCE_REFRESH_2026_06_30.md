# Runtime CPU Evidence Refresh (2026-06-30)

## Verdict

MUSU remains **NO-GO** against the full product spec, but today's local
HUGH_SECOND runtime CPU refresh closed one blocker and restored valid
one-machine evidence for two more runtime CPU lanes.

Latest clean gate:

- Source: `.local-build/go-no-go/latest.json`
- Generated: `2026-06-30T15:12:29.3167592+09:00`
- Commit: `b0581d235088296f90b42e90dbeed2f27e53b4f9`
- `manifest_git.dirty=false`
- `full_product_spec_ready=false`
- `ready_for_public_desktop_release=false`
- `blockers=10`
- `warnings=0`

## Evidence

Release-required idle CPU was recaptured with the missing strict flags:

- Command shape:
  `measure-musu-idle-cpu.ps1 -SampleSeconds 60 -Scenario desktop-open -RequireOwnedWebView2 -IncludeNode -IncludeWebView2 -FailOnHot -Json`
- Evidence:
  `docs/evidence/runtime-idle-cpu/1.15.0-rc.22/20260630-145344-HUGH_SECOND.desktop-open.evidence.json`
- Result: `ok=true`, `git_dirty=false`, `sample_seconds=60.028`,
  `operator_machine=HUGH_SECOND`, owned WebView2 present, Node/WebView2 budgets
  included, `hot_process_count=0`.

Full packaged runtime CPU scenario matrix was recaptured with a real peer route
target:

- Command shape:
  `measure-musu-runtime-cpu-scenarios.ps1 -Scenario startup-open,runtime-started,dashboard-open,desktop-open,post-route -SampleSeconds 60 -OpenDesktopApp -RunRouteProbe -RouteTarget hugh-main -AllowFailedRouteProbe -Json`
- Matrix:
  `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.22/20260630-145519-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- Strict verification:
  `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.22/20260630-145519-HUGH_SECOND.runtime-cpu-scenario-matrix.verification.json`
- Result: `ok=true`, `fail_count=0`, `git_dirty=false`, all five scenarios
  present, packaged WindowsApps MUSU command used, route target `hugh-main`
  present, non-self, non-local, and route output contained
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260630_145519`.

## Gate Movement

Before this refresh, the 2026-06-30 14:52 KST gate reported `blockers=11`,
`runtime_idle_cpu_valid_machine_count=0`,
`runtime_cpu_scenario_matrix_valid_machine_count=0`, and
`runtime_cpu_second_pc_route_attempt_verified=false`.

After this refresh:

- `blockers=10`
- `runtime_idle_cpu_valid_machine_count=1/2 [HUGH_SECOND]`
- `runtime_cpu_scenario_matrix_valid_machine_count=1/2 [HUGH_SECOND]`
- `runtime_cpu_second_pc_route_attempt_verified=true`
- `runtime_cpu_second_pc_route_attempt_valid_machine_count=1 [HUGH_SECOND]`

The post-commit gate recheck at `2026-06-30T15:12:29.3167592+09:00` keeps the
same `blockers=10`, `warnings=0`, and clean manifest state on commit
`b0581d235088296f90b42e90dbeed2f27e53b4f9`, so the committed documentation and
evidence refresh did not reopen runtime-source freshness blockers.

## Findings

| Severity | Issue | Evidence | Impact | Next |
|---|---|---|---|---|
| NO-GO | Product completion is still false. | Latest gate reports `full_product_spec_ready=false`, `ready_for_public_desktop_release=false`, and `blockers=10`. | A release-ready claim would still overstate evidence. | Keep closing the remaining physical/external and not-yet-built gates. |
| HIGH | Runtime CPU evidence is now valid on HUGH_SECOND but still incomplete for release. | Idle CPU and full matrix are both `1/2`. | The CPU lanes still require another physical machine before the full release gate can pass. | Run/import the same evidence on `hugh-main`. |
| INFO | The targeted second-PC route-attempt CPU blocker is closed for this gate. | `runtime_cpu_second_pc_route_attempt_verified=true` after the `hugh-main` post-route matrix. | This removes one blocker, but does not prove release-grade transport identity. | Do not confuse this with the separate multi-device or relay transport blockers. |
| NO-GO | The route remains legacy direct HTTP bearer, not release-grade QUIC/TLS. | The route explain inside the matrix records `current_transport=http_bearer`, `peer_identity_verified=false`, and `encryption=none_http_bearer`. | Multi-device and relay transport product claims remain blocked. | Implement/start hardened transport and collect release-grade route proof separately. |

## Remaining Blockers

- `multi-device`
- `private-mesh-packaged-release-proof`
- `runtime-idle-cpu` for the second machine
- `runtime-cpu-scenario-matrix` for the second machine
- `store-public-metadata`
- `store-release`
- `p2p-control-plane`
- `design-approval`
- `relay-transport`
- `v34-stale-self-heal`

## Next

1. Run the current second-PC kit on `hugh-main` and import its return archive.
2. If only CPU lanes are targeted, run the same idle CPU and matrix commands on
   `hugh-main` and import/promote the evidence.
3. Repair apex `musu.pro` DNS/TLS before retrying public metadata.
4. Continue relay transport implementation separately; this CPU route attempt
   does not close release-grade route identity or relay proof.
