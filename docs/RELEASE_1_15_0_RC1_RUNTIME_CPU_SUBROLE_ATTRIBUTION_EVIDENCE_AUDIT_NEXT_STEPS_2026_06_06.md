# MUSU 1.15.0-rc.1 Runtime CPU Subrole Attribution Evidence Audit

Date: 2026-06-06

## Summary

Runtime CPU evidence now separates the packaged bridge runtime, desktop shell,
and helper processes instead of reporting all MUSU-owned processes only as one
coarse role.

Result: HUGH_SECOND remains healthy as a one-machine local executor, and the
release gate now rejects CPU evidence that cannot identify `bridge_runtime`,
`desktop_shell`, and `webview2_helper` subroles. Public desktop release remains
No-Go because second-PC, live hosted P2P, support mailbox, and Store evidence
are still open.

## Product Boundary

The product split is unchanged.

- MUSU Desktop is the local executor.
- MUSU.PRO is remote user input, project/company room coordination,
  rendezvous, path selection, relay-fallback policy, and evidence control
  plane.
- MUSU.PRO must not become the default execution server or default payload
  data path.
- A fixed `localhost:3001` dashboard is optional developer/workspace surface,
  not a release requirement for the packaged local runtime.
- Local MUSU programs on each device do the work. Web/P2P input may deliver
  bounded authenticated work orders to a local program.

## What Changed

Commit `ef932b5a` hardened the CPU evidence pipeline:

- `measure-musu-idle-cpu.ps1` records `process_subrole`,
  `process_counts_by_subrole`, `memory_totals_by_subrole_mb`,
  `max_one_core_percent_by_subrole`, `bridge_registry`, and
  `bridge_registry_pid_match`.
- `measure-musu-runtime-cpu-scenarios.ps1` preserves those fields in each
  runtime matrix scenario.
- `verify-runtime-cpu-scenario-matrix.ps1` rejects evidence missing CPU
  attribution subrole counts, totals, max CPU fields, or bridge runtime
  process separation.
- `write-release-go-no-go.ps1` now requires bridge runtime and desktop shell
  separation in idle CPU evidence before accepting it as current.
- `test-release-evidence-verifiers.ps1` added a negative regression fixture:
  runtime matrix evidence without the `bridge_runtime` subrole is rejected.

This is release-evidence hardening. It does not change local runtime behavior.

## Evidence Refreshed

- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260606-013337-HUGH_SECOND.evidence.json`
- desktop-open idle CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260606-011243-HUGH_SECOND.desktop-open.evidence.json`
- five-scenario runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-012030-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- targeted HUGH-MAIN post-route CPU diagnostic:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-012740-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

## Evidence Results

Single-machine smoke passed from clean git at `039050fc`:

- `single_machine_surface=local-bridge-only`
- `dashboard_required=false`
- bridge `http://127.0.0.1:1421`
- packaged WindowsApps `musu.exe`
- CLI route checked

Desktop-open idle CPU passed from clean git at `ef932b5a` for `60.039s`:

- MUSU max one-core CPU: `0`
- Node max one-core CPU: `0`
- WebView2 max one-core CPU: `0.08`
- total working set: `364.66MB`
- hot process count: `0`
- subrole process counts: `bridge_runtime=1`, `desktop_shell=1`,
  `webview2_helper=6`

Five-scenario runtime CPU matrix passed verifier `ok=true` and `fail_count=0`
from clean git at `5624f4fc`:

- scenarios: `startup-open`, `runtime-started`, `dashboard-open`,
  `desktop-open`, `post-route`
- route token: `MUSU_CPU_SCENARIO_ROUTE_OK_20260606_012030`
- route task: `b0647b86-b491-4736-8a9e-11379be7179c`
- max MUSU CPU: `0`
- max Node CPU: `0`
- max WebView2 CPU: `0.1`
- max working set: `364.52MB`
- subrole process counts include `bridge_runtime=1`, `desktop_shell=1`,
  `webview2_helper=6`

Targeted HUGH-MAIN post-route CPU diagnostic passed verifier `ok=true` and
`fail_count=0` from clean git at `86b97f5a`:

- target: `HUGH-MAIN`
- route target address attempted by peer list: `192.168.1.192:8949`
- route result: timed out, explicitly allowed for this diagnostic
- post-route MUSU CPU: `0`
- post-route Node CPU: `0`
- post-route WebView2 CPU: `0.1`
- post-route working set: `364.18MB`
- subrole process counts include `bridge_runtime=1`, `desktop_shell=1`,
  `webview2_helper=6`

## Go/No-Go

Clean go/no-go after the single-machine evidence commit `d2296c4c` reports:

- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `msix_install_verified=true`
- runtime idle CPU valid machines: `1/2 [HUGH_SECOND]`
- runtime CPU matrix valid machines: `1/2 [HUGH_SECOND]`
- targeted second-PC route CPU valid machines: `1/1 [HUGH_SECOND]`
- `p2p_store_forward_relay_contract_verified=true`
- `public_metadata_ok=true`
- `manifest_git.dirty=false`

Remaining blockers:

- real second-PC multi-device evidence
- second-PC desktop-open idle CPU evidence
- second-PC five-scenario runtime CPU matrix evidence
- live `https://musu.pro` owner-scoped release-grade P2P control-plane proof
- operator-verified `musu@musu.pro` mailbox delivery
- Partner Center / Store release evidence

## Code Audit

No high or medium issue is open in this change.

Validation:

- `test-release-evidence-verifiers.ps1 -Json`: `ok=true`, `44/44`, failed `0`
- `audit-rust-background-loop-contract.ps1 -Json`: `ok=true`,
  `fail_count=0`, unaudited loops `0`, unaudited spawns `0`
- `audit-frontend-polling-contract.ps1 -Json`: `ok=true`, `fail_count=0`,
  low-duty call sites `29`, signal gaps `0`
- normal runtime CPU matrix verifier: `ok=true`, `fail_count=0`
- targeted HUGH-MAIN verifier: `ok=true`, `fail_count=0`
- `write-release-go-no-go.ps1 -ScriptTimeoutSeconds 120 -Json`: No-Go only on
  the external/second-machine/live-service gates listed above

Audit note: an initial matrix recapture was discarded because I copied idle
evidence into `docs/evidence` before starting the matrix, which correctly made
that matrix record `git_dirty=true`. I committed the idle evidence first and
recaptured the matrix from a clean tree. The dirty matrix was not promoted to
release evidence.

## Qualitative Assessment

The local desktop product is coherent on this machine: packaged runtime starts,
the bridge is healthy without a fixed dashboard URL, CLI route works, and the
desktop shell/WebView2 helper set stays below the idle CPU budget.

The evidence quality is materially better than before because Task Manager-like
process counts are no longer enough. The release gate now proves whether CPU
belongs to the bridge runtime, desktop shell, WebView2 helpers, node helpers, or
other owned processes.

The release risk is still outside this one-machine runtime path: missing
second-PC proof, missing live owner-scoped MUSU.PRO P2P proof, missing support
mailbox evidence, and missing Store/Partner Center evidence.

## Code And Document Indexing

MUSU local indexing was refreshed after this report, WIKI, GOAL, spec, BETA
checklist, and CoS memory updates:

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- files: `2463`
- symbols: `2717`
- elapsed: `35338 ms`

gbrain was not rerun because the same-session blocker remains unchanged:
missing `ZEROENTROPY_API_KEY`, generated/evidence import failures,
`sync.last_commit` not advancing, and `gstack-brain-sync exited undefined`.
`AGENTS.md` GBrain Search Guidance remains intentionally absent until
semantic/symbol search returns verified hits on this Windows machine.

## Next Steps

1. Install the same current MUSU build on the second Windows PC and return
   second-PC MSIX, single-machine, idle CPU, runtime matrix, and multi-device
   route evidence.
2. Configure live `musu.pro` P2P control auth plus KV/Upstash relay lease
   storage and record owner-scoped live P2P evidence without `AllowUnverified`.
3. Implement release-grade relay payload transport and delivery proof before
   flipping `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=true`.
4. Verify `musu@musu.pro` mailbox delivery.
5. Record Partner Center product reservation, Store submission, certification,
   and restricted capability approval evidence.
