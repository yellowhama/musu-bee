# CoS Memory: Second-PC Runtime Cleanup Hardening

Date: 2026-06-02 18:52 KST

`run-second-pc-release-check.ps1` now records cleanup evidence at the end of
every second-PC release run.

Changes:

- cleanup runs in `finally`
- output path:
  `.local-build/runtime-cleanup/*.runtime-cleanup.json`
- schema:
  `musu.second_pc_runtime_cleanup.v1`
- cleanup command:
  packaged WindowsApps alias `musu down --json --timeout-sec 5`
- closes packaged `musu-desktop.exe` shells opened by the evidence run
- includes cleanup JSON in the second-PC return zip
- top-level wrapper `ok=true` now requires cleanup success
- multidevice kit README and operator action-pack quickstart mention cleanup
  evidence
- `verify-operator-action-pack.ps1` checks for cleanup instructions

Validation:

- PowerShell parser validation passed for:
  - `scripts/windows/run-second-pc-release-check.ps1`
  - `scripts/windows/prepare-multidevice-test-kit.ps1`
  - `scripts/windows/prepare-operator-action-pack.ps1`
  - `scripts/windows/verify-operator-action-pack.ps1`
- `scripts/windows/test-release-evidence-verifiers.ps1` passed 13/13.
- Short local wrapper smoke:
  `run-second-pc-release-check.ps1 -SkipRuntimeIdleCpu -SkipRuntimeCpuScenarioMatrix -NoReturnZip -CommandTimeoutSec 30 -Json`
  failed at MSIX install evidence capture because `HUGH_SECOND` still has the
  known `C:\Users\empty\.cargo\bin\musu.exe` alias shadowing the WindowsApps
  alias.
- Cleanup still ran from `finally` and produced:
  `.local-build/runtime-cleanup/20260602-185052-HUGH_SECOND.runtime-cleanup.json`
  with `ok=true`, `stop_exit_code=0`, and `remaining_desktop_shell_count=0`.

Release meaning:

- This improves second-PC process ownership and cleanup attribution.
- It does not close the second-PC release gate.
- The next real second-PC return must include runtime idle CPU, runtime CPU
  matrix, process attribution, cleanup, and route evidence.

Canonical report:

- `docs/RELEASE_1_15_0_RC1_SECOND_PC_CLEANUP_HARDENING_2026_06_02.md`
