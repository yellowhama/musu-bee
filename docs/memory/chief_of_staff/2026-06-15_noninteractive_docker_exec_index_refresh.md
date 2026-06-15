# 2026-06-15 Non-Interactive Docker Exec Index Refresh

- Ran MUSU local indexer after wiki/1168 non-interactive Docker exec audit and
  docs updates.
- Command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- Result: `3215 files`, `3482 symbols`, `106883 ms`.
- Search anchors: `wiki/1168`, `wiki/1169`, `docker compose exec -T`,
  `non-interactive Docker exec`, `create-join-key.ps1`,
  `create-join-key.sh`, `START_CONTROL_HEALTH_TIMEOUT`, and
  `cargo check --tests`.
