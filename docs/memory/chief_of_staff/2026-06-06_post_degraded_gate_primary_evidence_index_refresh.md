# 2026-06-06 Post-Degraded-Gate Primary Evidence Index Refresh

MUSU local indexer was refreshed after the primary evidence commit.

Command:

```powershell
& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee
```

Result:

- `2510 files`
- `2731 symbols`
- `18799 ms`

Clean go/no-go after commit `02c24fd3d712b1fb10fb36cd59165427f57d722a`:

- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- runtime idle CPU `1/2`
- runtime CPU scenario matrix `1/2`
- targeted second-PC route CPU `true`
- `frontend_polling_contract_verified=true`
- `rust_background_loop_contract_verified=true`
- `idle_busy_loop_candidate_contract_verified=true`
- process ownership/startup single-instance/desktop single-instance `true`
- `p2p_control_plane_verified=false`
- `manifest_git.dirty=false`

Remaining blockers:

- real second-PC multi-device evidence
- second-PC desktop-open CPU evidence
- second-PC runtime CPU scenario matrix evidence
- public metadata recheck without `-SkipPublicMetadata`
- `musu@musu.pro` mailbox proof
- Store/Partner Center proof
- hosted MUSU.PRO P2P control-plane/relay proof

gbrain was not rerun because the same-session blocker remains missing
`ZEROENTROPY_API_KEY`, generated/evidence import failures,
`sync.last_commit` not advancing, and `gstack-brain-sync exited undefined`.
The MUSU local index remains the reliable current repo index.
