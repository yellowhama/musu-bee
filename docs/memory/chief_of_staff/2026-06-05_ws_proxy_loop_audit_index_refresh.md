# 2026-06-05 WebSocket proxy loop audit index refresh

Indexing was run after wiki/745, GOAL v566, and the WebSocket proxy loop audit
documentation update.

MUSU local indexer:

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- result: `indexed 2407 files (2690 symbols) in 16395 ms`

gbrain:

- quiet run exited code `1` without useful output.
- non-quiet rerun started with `mode=incremental`, `engine=pglite`.
- code stage: `OK`, source `gstack-code-musu-bee-8815b622`,
  `page_count=356`.
- memory stage: `OK`, `0 imported`, `1 unchanged`, `0 failed`.
- final state: `2 ok, 1 error`.
- failing stage: `brain-sync`, `gstack-brain-sync exited undefined`.
- import reported missing `ZEROENTROPY_API_KEY`, generated/evidence file
  failures, and `sync.last_commit` did not advance.

Decision:

- Treat the MUSU local indexer as the reliable current repo index evidence.
- Do not add GBrain Search Guidance to `AGENTS.md` until semantic/symbol search
  returns verified hits on this Windows machine.
