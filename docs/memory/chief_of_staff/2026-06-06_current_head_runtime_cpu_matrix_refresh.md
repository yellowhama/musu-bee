# CoS Memory - Current HEAD Runtime CPU Matrix Refresh

Date: 2026-06-06

Fresh current-HEAD runtime CPU matrix evidence was captured on `HUGH_SECOND`
from clean commit `ac1e67a4dd8f610a6f09ff61d3107f556e2ac5e5`.

Evidence:

- full matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-094149-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- full matrix verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-094149-HUGH_SECOND.verification.json`
- HUGH-MAIN target diagnostic:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-095252-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- HUGH-MAIN target verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-095252-HUGH_SECOND.target-route.verification.json`

Full matrix verifier passed with `ok=true`, `fail_count=0`. Scenario CPU stayed
under budget across `startup-open`, `runtime-started`, `dashboard-open`,
`desktop-open`, and `post-route`. The highest WebView2 CPU value in the full
matrix was `0.16`; hot process count was `0` in every scenario.

The HUGH-MAIN diagnostic verifier passed with `ok=true`, `fail_count=0`,
`ExpectedPostRouteTarget=HUGH-MAIN`, and allowed failed route probe. The route
attempt timed out against `http://192.168.1.192:8949/api/tasks/delegate`, then
the 60s CPU sample stayed healthy: MUSU `0`, Node `0`, WebView2 `0.13`, hot
process count `0`, owned processes `8`, WebView2 helpers `6`, working set
`364.24MB`.

Qualitative/code audit result: no high or medium issue found. No runtime code
changed in this update; the diff is evidence/docs only. The HUGH-MAIN route
timeout is diagnostic and must not be counted as successful multi-device proof.

Product boundary remains: MUSU Desktop executes locally; MUSU.PRO is remote
input, rooms, presence, rendezvous, path selection, relay fallback, and
evidence. `localhost:3001` is optional developer/operator dashboard behavior,
not required packaged MUSU Desktop behavior.
