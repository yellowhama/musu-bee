# 2026-06-07 Public Metadata and P2P Source Blocker Recheck Index Refresh

MUSU local indexer was refreshed after the public metadata and P2P source
blocker recheck.

Command:

`& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`

Result:

- `3085 files`
- `2808 symbols`
- `13386 ms`

Indexed context includes:

- `docs\RELEASE_1_15_0_RC1_PUBLIC_METADATA_AND_P2P_SOURCE_BLOCKER_RECHECK_2026_06_07.md`
- current-head go/no-go with `public_metadata_ok=true`
- current blocker count `6`
- P2P source blocker status
- BETA checklist, WIKI/WIKI_INDEX, GOAL, and CoS memory

Release meaning:

- public privacy/support metadata is no longer an active blocker;
- P2P release relay byte path, second-PC evidence, support mailbox, and Store
  evidence remain open.
