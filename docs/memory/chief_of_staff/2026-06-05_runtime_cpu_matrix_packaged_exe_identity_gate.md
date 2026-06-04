# Chief of Staff Memory: Runtime CPU Matrix Packaged Executable Identity Gate

Date: 2026-06-05T04:48+09:00

Decision:

- Runtime CPU scenario matrix evidence must prove it used the installed
  packaged MUSU runtime.
- `measure-musu-runtime-cpu-scenarios.ps1` now defaults to the WindowsApps
  `musu.exe` alias, records `musu_exe`, `allow_developer_runtime`, and
  `musu_exe_release_identity`, and rejects non-packaged paths unless
  `-AllowDeveloperRuntime` is explicitly supplied.
- `verify-runtime-cpu-scenario-matrix.ps1` now rejects matrices whose
  executable identity is missing or points at a repo/debug runtime.
- The release evidence verifier regression suite now includes a negative debug
  executable matrix fixture.

Validation:

- Parser checks passed for the changed PowerShell scripts.
- Short 3-second diagnostic runtime-started sample passed with
  `musu_exe=C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe`,
  `musu_exe_release_identity=true`, bridge `http://127.0.0.1:7555`, and max
  MUSU CPU `0`. It was dirty-tree diagnostic evidence, not release evidence.
- Release evidence verifier regression passed with `ok=true`, `case_count=30`,
  and `failed_case_count=0`.
- `git diff --check` passed.

Release status:

- Older runtime CPU matrix evidence without packaged executable identity is no
  longer release-grade.
- `127.0.0.1:3001/app` may be connection-refused because the workspace Next
  dashboard was intentionally stopped; the packaged local bridge is separate at
  `127.0.0.1:7555`.
- Public release remains No-Go on fresh clean packaged CPU matrix, second-PC
  evidence, two-machine CPU/matrix, hosted P2P, support mailbox, and Store
  evidence.
