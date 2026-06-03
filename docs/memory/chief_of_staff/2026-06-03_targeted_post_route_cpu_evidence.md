# CoS Memory - Targeted Post-Route CPU Evidence

Date: 2026-06-03

Evidence:

- matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-145454-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- post-route sample:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-145454-HUGH_SECOND.post-route.evidence.json`
- verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-145454-HUGH_SECOND.targeted-post-route.verification.json`

Result:

- clean source commit `d26a2b78e3a8684e124aade5108887e261089487`
- target `HUGH-MAIN`
- route output timed out against `192.168.1.192:8949`
- route token was not produced
- `failure_allowed=true`
- verifier `ok=true`, `fail_count=0`
- 60.049s sample, hot process count 0
- max CPU: MUSU 0, Node 0, WebView2 0.10, other 0
- process counts: MUSU 2, Node 0, WebView2 6, other 0
- working set 402.69MB
- cleanup stopped bridge PID 29652 and desktop PID 37956

Harness hardening:

- normal `measure-musu-runtime-cpu-scenarios.ps1` route probes now also fail
  when the expected per-run token is missing, even if process exit handling is
  ambiguous
- `-AllowFailedRouteProbe` remains the explicit diagnostic escape hatch

Boundary:

- this is CPU attribution after a failed target route attempt
- it does not close successful multi-device route evidence or second-PC release
  CPU gates
