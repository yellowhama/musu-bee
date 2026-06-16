# 2026-06-15 Bootstrap Identifier Validation Index Refresh

- Ran MUSU local indexer after wiki/1172 bootstrap identifier validation audit
  and docs updates.
- Command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- Result: `3220 files`, `3485 symbols`, `88061 ms`.
- Search anchors: `wiki/1172`, `wiki/1173`,
  `validate_private_mesh_tailnet_name`,
  `validate_private_mesh_base_domain`,
  `bootstrap_rejects_script_unsafe_tailnet_and_base_domain_inputs`,
  `--tailnet-name`, and `--base-domain`.
