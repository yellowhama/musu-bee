# 2026-06-07 Current HEAD Primary CPU Refresh After Process Ownership CLI Hardening

## Decision

Primary CPU evidence after process ownership CLI hardening is good on
`HUGH_SECOND`, but public release remains No-Go because the second-PC and
hosted P2P/relay evidence gates are still open.

## Evidence

- Clean desktop-open idle CPU:
  `20260607-024332-HUGH_SECOND.desktop-open.evidence.json`
- idle commit: `05904ae3cc714ae31984f11c56005718439e2335`
- idle `git_dirty=false`, hot process count `0`
- idle max CPU: MUSU `0`, Node `0`, WebView2 `0.08`
- idle working set: `361.49MB`
- clean matrix:
  `20260607-025704-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- matrix commit: `db4e0c8ef99dd2b75440a46c2d3da468dd57a72d`
- matrix `git_dirty=false`, dirty scenarios none
- matrix max CPU: MUSU `0`, Node `0`, WebView2 `0.18`
- matrix max working set: `361.4MB`
- target-route verifier: `ok=true`, `fail_count=0`
- full route-success verifier: `ok=false`, `fail_count=1`, failing only
  `post-route route probe`

## Product Spec Update

MUSU Desktop remains the local executor. MUSU.PRO is remote input, project and
company rooms, meeting coordination, presence, rendezvous, path selection,
relay fallback coordination, and evidence/control plane. MUSU.PRO does not run
local work and does not make `localhost:3001` part of the packaged desktop
runtime contract.

## Process Lesson

Do not write multi-scenario CPU matrix output directly to tracked
`docs\evidence`. Use the default ignored `.local-build` output root, verify
there, then copy the verified matrix and verification JSON to docs. Use
`-RoutePrompt "Return exactly {TOKEN}"` so the wait prompt binds the script's
expected route token.

## Audit Result

No high/medium code issue was found. No source code changed. Current local CPU
is quiet, but `HUGH-MAIN` still times out at `192.168.1.192:8949`; the next
release reducer is reachable second-PC evidence.
