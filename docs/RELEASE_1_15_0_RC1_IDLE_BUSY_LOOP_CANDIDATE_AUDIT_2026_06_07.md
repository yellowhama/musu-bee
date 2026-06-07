# MUSU 1.15.0-rc.1 Idle Busy-Loop Candidate Audit

Date: 2026-06-07 20:46 KST

## Scope

This report records the current source-contract and runtime-evidence state for
the idle busy-loop / CPU 20% release blocker.

The objective is evidence-based: release idle cannot be accepted by feel. It
must be proven by source contracts that prevent tight background loops, runtime
CPU samples with process role/subrole attribution, and a release gate requiring
60s samples at <= 5% of one logical core on two Windows machines.

## Captured Evidence

Source-contract audit evidence:

- Rust background loops:
  `docs\evidence\idle-busy-loop-candidates\1.15.0-rc.1\20260607-204601-HUGH_SECOND.rust-background-loop-contract.json`
- Frontend polling:
  `docs\evidence\idle-busy-loop-candidates\1.15.0-rc.1\20260607-204601-HUGH_SECOND.frontend-polling-contract.json`

Runtime CPU evidence from the current packaged build:

- desktop-open idle CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260607-202202-HUGH_SECOND.current-head-after-target-proof.desktop-open.evidence.json`
- five-state runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-202317-HUGH_SECOND.current-head-after-target-proof.runtime-cpu-scenario-matrix.json`
- target-route diagnostic:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-202934-HUGH_SECOND.current-head-target-route-after-target-proof.runtime-cpu-scenario-matrix.json`

Go/no-go summary from clean commit
`9e0f310a2ea4468502febf56171594a44944a618`:

- `idle_busy_loop_candidate_count=8`
- `idle_busy_loop_candidate_verified_count=8`
- `idle_busy_loop_candidate_unverified_count=0`
- `frontend_polling_contract_verified=true`
- `rust_background_loop_contract_verified=true`
- runtime idle CPU valid machines `1`
- runtime CPU scenario matrix valid machines `1`
- targeted route-attempt CPU diagnostic valid machines `1`

## Candidate Status

| Candidate | Current status |
|---|---|
| Clipboard monitor | Verified opt-in, cancellable, sleeping between polls. Default-off via `MUSU_ENABLE_CLIPBOARD_SYNC`. |
| mDNS discovery | Verified opt-in, cancellation-aware, bounded by deadline, with noisy interface classes separately gated. Default-off via `MUSU_ENABLE_MDNS`. |
| Health check retry loop | Verified bounded in auto-update health polling with initial delay, max backoff, and sleep. |
| Bridge readiness wait loop | Verified bounded by caller timeout and capped backoff sleep. |
| Frontend interval/refetch loop | Verified: 29 expected low-duty polling call sites, all signal-aware, direct interval hits `0`, direct visibility listener hits `0`. |
| Relay payload target poller | Verified opt-in, low-duty interval, backoff ceiling, and cancellation-aware sleep. |
| Cloud heartbeat | Verified explicit interval, default `300s`, minimum `60s`, failure backoff, and cancellation-aware sleep. |
| Log/telemetry flush loop | Verified no background telemetry/log flush worker primitives; only one allowlisted one-shot uninstall flush primitive. |

## Runtime CPU Read

The current one-machine packaged evidence does not reproduce a 20% idle CPU
busy loop.

Desktop-open idle CPU:

- `ok=true`
- sample `60.052s`
- MUSU CPU `0`
- Node CPU `0`
- owned WebView2 max CPU `0.08`
- hot process count `0`
- owned WebView2 helpers `6`
- working set `367.77MB`

Five-state matrix:

- `ok=true`
- `fail_count=0`
- scenarios: `startup-open`, `runtime-started`, `dashboard-open`,
  `desktop-open`, `post-route`
- local route token:
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260607_202317`
- max owned WebView2 CPU `0.16`
- max working set `367.99MB`

Target-route diagnostic:

- target `PRIMARY-PC`
- route probe failed as expected with `peer 'PRIMARY-PC' not found`
- failure was explicitly allowed for diagnostic CPU sampling
- MUSU CPU `0.16`
- WebView2 CPU `0.16`
- hot process count `0`

## Release Meaning

The current source and one-machine runtime evidence narrows the blocker:

- tight background-loop candidates are source-contract verified;
- current HUGH_SECOND packaged runtime is under the idle CPU budget;
- release is still blocked because the CPU gate requires two machines.

The next release evidence step is to install the same current MUSU build on the
second Windows PC and capture:

1. desktop-open idle CPU for 60s;
2. five-state runtime CPU matrix;
3. real second-PC route evidence after route preflight succeeds.

If a future idle CPU regression appears, compare the new evidence against this
report and check which role/subrole rises first: `bridge_runtime`,
`desktop_shell`, `webview2_helper`, `node_helper`, or `musu_runtime`.
