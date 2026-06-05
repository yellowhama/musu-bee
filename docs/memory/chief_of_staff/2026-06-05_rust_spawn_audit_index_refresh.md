# 2026-06-05 Rust Spawn Audit Index Refresh

Indexing was refreshed after wiki/747 and GOAL v570/v571.

MUSU local indexer:

- command: `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- result: `2414 files`, `2690 symbols`, `10865 ms`

gbrain:

- quiet run exited code `1` with no output
- non-quiet run used `mode=incremental`, `engine=pglite`
- code stage `OK`: source `gstack-code-musu-bee-8815b622`,
  `page_count=540`
- import found `3599` code files, imported `92` pages, skipped `3507`
  pages, created `5188` chunks, and hit `3059` file failures
- `sync.last_commit` did not advance
- memory stage `OK`: `0 imported`, `1 unchanged`, `0 failed`
- final state: `2 ok, 1 error`
- failing stage: `brain-sync`, `gstack-brain-sync exited undefined`
- import blockers included missing `ZEROENTROPY_API_KEY`, `row.deleted_at`
  import failures, and array-length import failures

Do not add GBrain Search Guidance to `AGENTS.md` until semantic/symbol search
returns verified hits on this Windows machine. The MUSU local indexer remains
the reliable current repo index.
