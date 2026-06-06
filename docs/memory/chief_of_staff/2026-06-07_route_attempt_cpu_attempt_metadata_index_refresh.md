# 2026-06-07 route attempt CPU attempt metadata index refresh

## Index

MUSU local indexer was refreshed after the route attempt CPU attempt metadata
gate.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- files: `2810`
- symbols: `2776`
- elapsed: `14922 ms`

## Indexed Context

- `verify-runtime-cpu-scenario-matrix.ps1` allowed failed route probe attempt
  metadata checks
- `test-release-evidence-verifiers.ps1` regression
  `runtime matrix rejects allowed failed route attempt without per-attempt metadata`
- wiki/921 and GOAL v746
- route attempt CPU attempt metadata report and next-step plan
- BETA checklist, runtime stabilization spec, P2P control-plane notes, network
  boundary spec, WIKI, WIKI_INDEX, and CoS memory
