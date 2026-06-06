# CoS Memory: Crash-Recovery Contract Index Refresh

Date: 2026-06-06

MUSU local indexer was refreshed after the crash-recovery contract gate.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- result: `2707 files`, `2776 symbols`, `14571 ms`

Indexed context includes the Rust `musu up` stale bridge registry cleanup,
`audit-musu-crash-recovery-contract.ps1`, go/no-go/handoff/packet wiring,
release verifier coverage, canonical report, next-step plan, BETA checklist,
P2P control-plane spec, network boundary spec, WIKI/WIKI_INDEX, GOAL v692, and
CoS memory.
