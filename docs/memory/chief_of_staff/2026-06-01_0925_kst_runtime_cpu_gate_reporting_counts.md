# CoS Memory - Runtime CPU Gate Reporting Counts

Date: 2026-06-01 09:25 KST

`write-release-go-no-go.ps1` now exposes the runtime idle CPU machine-count
state at top level instead of only inside the nested evidence object:

- `runtime_idle_cpu_min_machine_count`
- `runtime_idle_cpu_valid_machine_count`
- `runtime_idle_cpu_valid_machines`
- `runtime_idle_cpu_candidate_count`

The non-JSON output also prints `runtime_idle_cpu_valid_machines:
<valid>/<min> [machines]`. `show-final-release-handoff-status.ps1` mirrors the
same fields under `gates`.

Current proof from the smoke run:

- `runtime_idle_cpu_verified=false`
- `runtime_idle_cpu_valid_machine_count=1`
- `runtime_idle_cpu_min_machine_count=2`
- `runtime_idle_cpu_valid_machines=[HUGH_SECOND]`
- `runtime_idle_cpu_candidate_count=24`

This does not close the CPU gate. It makes the remaining blocker explicit:
second-PC `desktop-open` CPU evidence is still required.
