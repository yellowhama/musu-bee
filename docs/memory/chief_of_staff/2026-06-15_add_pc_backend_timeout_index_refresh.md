# 2026-06-15 Add PC Backend Timeout Index Refresh

- Ran MUSU local indexer after wiki/1164 Add PC backend timeout audit and docs
  updates.
- Command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- Result: `3207 files`, `3482 symbols`, `351641 ms`.
- Search anchors: `wiki/1164`, `wiki/1165`,
  `ADD_PC_CREATE_JOIN_KEY_TIMEOUT`, `ADD_PC_START_CONTROL_HOST_TIMEOUT`,
  `CREATE_JOIN_KEY_HELPER_TIMEOUT`, `START_CONTROL_UP_TIMEOUT`,
  `add_pc_backend_process_timeouts_are_bounded`, and
  `STATUS_IN_PAGE_ERROR`.
