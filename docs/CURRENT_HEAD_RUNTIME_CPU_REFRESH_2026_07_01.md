# Current HEAD Runtime CPU Refresh (2026-07-01)

## Verdict

Current HEAD `9b286237732a60f416efcf2a9e262a684156f96c` now has fresh
packaged runtime CPU evidence from `HUGH_SECOND`.

This closes the local `runtime-cpu-second-pc-route-attempt` lane for this
machine: the full five-scenario matrix includes a targeted `hugh-main`
post-route sample, a successful direct route attempt, and verifier-passing
target-route metadata.

This does not close the full runtime CPU release gate. The release gate still
requires idle CPU and full scenario matrix evidence from two physical machines;
after this refresh, only `HUGH_SECOND` is valid.

## Evidence

Idle CPU:

- `docs/evidence/runtime-idle-cpu/1.15.0-rc.22/20260701-092602-HUGH_SECOND.desktop-open.evidence.json`

Runtime CPU scenario matrix:

- `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.22/20260701-092716-HUGH_SECOND.startup-open.evidence.json`
- `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.22/20260701-092716-HUGH_SECOND.runtime-started.evidence.json`
- `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.22/20260701-092716-HUGH_SECOND.dashboard-open.evidence.json`
- `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.22/20260701-092716-HUGH_SECOND.desktop-open.evidence.json`
- `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.22/20260701-092716-HUGH_SECOND.post-route.evidence.json`
- `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.22/20260701-092716-HUGH_SECOND.post-route.route-evidence.json`
- `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.22/20260701-092716-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.22/20260701-092716-HUGH_SECOND.runtime-cpu-scenario-matrix.verification.json`
- `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.22/20260701-092716-HUGH_SECOND.target-route.verification.json`

Dirty pre-commit go/no-go:

- `.local-build/go-no-go/after-current-head-cpu-refresh-dirty-20260701.json`

## What Passed

- Idle CPU evidence has `ok=true`, `git_commit=9b286237732a60f416efcf2a9e262a684156f96c`,
  and `git_dirty=false`.
- Idle sample duration is at least 60 seconds.
- Hottest observed owned process is `0.62%` of one logical CPU, below the
  `5%` budget.
- Idle process inventory records 8 scoped processes, 2 MUSU processes, and 6
  MUSU-owned WebView2 helpers.
- Full matrix evidence has `ok=true`, `git_dirty=false`, and all required
  scenarios: `startup-open`, `runtime-started`, `dashboard-open`,
  `desktop-open`, and `post-route`.
- Strict matrix verification has `ok=true` and `fail_count=0`.
- Target-route verification has `ok=true` and `fail_count=0` with
  `ExpectedPostRouteTarget=hugh-main`, `RejectSelfPostRouteTarget`, and
  `RejectLocalPostRouteTarget`.
- The post-route attempt succeeded from `hugh_second` to `hugh-main` over LAN
  candidate `192.168.1.192:4387`.
- Route evidence records `schema=musu.route_evidence.v1`,
  `route_kind=lan`, `result=success`, `peer_identity_verified=false`,
  `encryption=none_http_bearer`, and `payload_transited_musu_infra=false`.

## Go/No-Go Effect

Dirty pre-commit go/no-go at `2026-07-01T09:35:41.2071561+09:00` reports:

- `runtime_idle_cpu_valid_machine_count=1`
- `runtime_idle_cpu_valid_machines=[HUGH_SECOND]`
- `runtime_cpu_scenario_matrix_valid_machine_count=1`
- `runtime_cpu_scenario_matrix_valid_machines=[HUGH_SECOND]`
- `runtime_cpu_second_pc_route_attempt_verified=true`
- `runtime_cpu_second_pc_route_attempt_valid_machines=[HUGH_SECOND]`
- `full_product_spec_ready=false`
- `ready_for_public_desktop_release=false`

The `git` blocker in that run is expected because this report and the promoted
evidence were not yet committed.

## Index Refresh

- `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
  indexed `3651 files` and `3947 symbols`.
- Product brain ingest under `local/musu` posted 4 sources total for this
  refresh, processed 4, and recovered 0.
- Recall query `MUSU current HEAD CPU evidence summary corrected paths`
  returned 5 results with top title
  `MUSU current HEAD CPU evidence summary corrected paths`.

## Qualitative Audit

No CPU busy-loop regression is indicated by this evidence. The default runtime
profile remains low-duty: the package reports bounded cloud heartbeat and relay
target polling, while mDNS, clipboard sync, planner, file watch, and
auto-update supervisor loops are inactive by default.

The direct route sample is useful operational evidence but is not
release-grade transport evidence. It is still `none_http_bearer`, with
`peer_identity_verified=false`, so the P2P/relay release-grade transport lane
and `relay-transport` blocker remain open.

The remaining CPU gap is physical coverage, not a local package regression:
`HUGH_SECOND` now contributes current valid idle and matrix evidence, but the
gate requires a second valid machine, expected to be `hugh-main`.

## Next Step

Run the same CPU capture on `hugh-main` using the second-PC release check or a
direct matrix capture targeted back at `hugh_second`, then import/promote the
returned evidence and rerun `write-release-go-no-go.ps1 -Json`.
