# 2026-06-06 runtime CPU subrole attribution index refresh

Indexing was refreshed after wiki/757 and GOAL v582.

MUSU local indexer:

- `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2463 files`
- `2717 symbols`
- `35338 ms`

gbrain was not rerun because the same-session blocker remains unchanged:
missing `ZEROENTROPY_API_KEY`, generated/evidence import failures,
`sync.last_commit` not advancing, and `gstack-brain-sync exited undefined`.
`AGENTS.md` GBrain Search Guidance remains intentionally absent until
semantic/symbol search returns verified hits on this Windows machine.
