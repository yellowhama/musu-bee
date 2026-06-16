# 2026-06-15 Root WSL Scratch Hygiene Index Refresh

- Ran MUSU local indexer after wiki/1170 root WSL scratch hygiene audit and
  docs updates.
- Command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- Result: `3217 files`, `3482 symbols`, `70358 ms`.
- Search anchors: `wiki/1170`, `wiki/1171`, `.wsl_*.sh`, `.wsl_join2.sh`,
  `preauth_key.txt`, `root WSL scratch hygiene`, and `git check-ignore`.
