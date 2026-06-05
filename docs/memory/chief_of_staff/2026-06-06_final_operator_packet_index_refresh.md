# 2026-06-06 final operator packet index refresh

Status: DONE.

MUSU local indexing was refreshed after the final operator packet/action pack
report and wiki/spec updates.

Command:

```powershell
& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee
```

Result:

- `2469 files`
- `2717 symbols`
- `18185 ms`

Verification:

- release evidence verifier regressions: `ok=true`, `case_count=45`,
  `failed_case_count=0`
- `git diff --check`: pass, with only existing CRLF normalization warnings

Search terms:

- `GOAL v587`
- `wiki/762`
- `20260606-020415`
- `20260606-020432`
- `MUSU-second-PC-transfer-1.15.0-rc.1-20260606-020432.zip`
- `runtime_cpu_subrole_contract_ok`
- `verifier regressions 45/45`
- `MUSU Desktop local executor`
- `MUSU.PRO remote input control plane`

gbrain was not rerun because the same-session blocker remains missing
`ZEROENTROPY_API_KEY`, generated/evidence import failures,
`sync.last_commit` not advancing, and `gstack-brain-sync exited undefined`.
