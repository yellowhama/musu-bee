# 2026-06-04 HUGH-MAIN Route Attempt CPU Evidence

Captured targeted CPU evidence after attempting a route to `HUGH-MAIN`.

Evidence:

- matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-171623-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- post-route sample:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-171623-HUGH_SECOND.post-route.evidence.json`
- target-route verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-171623-HUGH_SECOND.target-route.verification.json`
- summary:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-171623-HUGH_SECOND.target-route.summary.md`

Result:

- route probe target `HUGH-MAIN`
- route probe failed by timeout to `http://192.168.1.192:8949/api/tasks/delegate`
- failure was explicitly allowed for this targeted CPU evidence
- verifier passed with `ok=true`, `fail_count=0`,
  `expected_post_route_target=HUGH-MAIN`, and
  `allow_failed_post_route_probe=true`
- CPU sample passed for `60.058s` with MUSU `0`, Node `0.05`, WebView2 `0.18`,
  working set `465.97MB`, owned WebView2 `6`, hot process count `0`

Interpretation: this proves the primary machine did not enter an idle busy-loop
after a failed second-PC route attempt. It is not successful multi-device route
evidence.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_HUGH_MAIN_ROUTE_ATTEMPT_CPU_EVIDENCE_2026_06_04.md`
