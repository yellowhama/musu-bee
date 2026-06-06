# 2026-06-06 post-route wait token binding gate index refresh

MUSU local indexer was refreshed after the post-route wait token binding gate.

Command:

```powershell
& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee
```

Result:

- `2734 files`
- `2776 symbols`
- `26395 ms`

Indexed context includes:

- `verify-runtime-cpu-scenario-matrix.ps1` wait-token binding checks
- `test-release-evidence-verifiers.ps1` negative cases:
  - `runtime matrix rejects allowed failed route attempt with zero exit code`
  - `runtime matrix rejects allowed failed route attempt with nonnumeric exit code`
  - `runtime matrix rejects route wait prompt without expected token`
  - `runtime matrix rejects successful route probe without token output`
- canonical report
  `RELEASE_1_15_0_RC1_POST_ROUTE_WAIT_TOKEN_BINDING_GATE_2026_06_06.md`
- GOAL v706
- WIKI wiki/881

Search terms:

- `GOAL v707`
- `wiki/882`
- `post-route wait token binding gate index refresh`
- `expected_token`
- `--wait <prompt-with-token>`
- `runtime matrix rejects allowed failed route attempt with zero exit code`
- `runtime matrix rejects allowed failed route attempt with nonnumeric exit code`
- `runtime matrix rejects successful route probe without token output`
- `case_count=77`
