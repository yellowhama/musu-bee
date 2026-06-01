# CoS Memory - Second-PC CPU Matrix Return Flow

Date: 2026-06-01 10:38 KST

The runtime CPU scenario matrix is now wired into the second-PC operator path.

Code changes:

- `run-second-pc-release-check.ps1` now captures
  `musu.runtime_cpu_scenario_matrix.v1` by default after install/handoff and the
  release-grade desktop-open CPU sample. It writes under
  `.local-build\runtime-cpu-scenarios\`, includes the matrix and per-scenario
  files in the return zip, and exposes `-SkipRuntimeCpuScenarioMatrix` plus
  `-FailOnRuntimeCpuScenarioMatrix`.
- `import-second-pc-return.ps1` now imports the matrix to
  `.local-build\runtime-cpu-scenarios\` and selects release-grade idle CPU
  evidence only from `.local-build\runtime-idle-cpu\` with `scenario=desktop-open`
  and `require_owned_webview2=true`, so diagnostic matrix files cannot shadow the
  release gate sample.
- `prepare-multidevice-test-kit.ps1`, `prepare-final-operator-gate-packet.ps1`,
  `verify-final-operator-gate-packet.ps1`, `verify-operator-action-pack.ps1`,
  and `audit-desktop-release-readiness.ps1` now know about
  `measure-musu-runtime-cpu-scenarios.ps1`.

Validation:

- PowerShell parser checks passed for all touched scripts.
- A fresh multi-device kit was generated at
  `.local-build\multi-device-test-kit\musu-multidevice-1.15.0-rc.1-20260601-103622.zip`;
  zip inspection confirmed it includes `measure-musu-runtime-cpu-scenarios.ps1`.
- A synthetic second-PC return zip containing MSIX evidence, handoff, release
  CPU evidence, and a matrix imported successfully. The importer returned both
  `runtime_idle_cpu_evidence_path` and `runtime_cpu_scenario_matrix_path`.

This improves CPU busy-loop attribution on the real second PC. It still does
not close public release: second-PC route evidence, second-PC release CPU
evidence from real hardware, `musu@musu.pro` inbox proof, and Store evidence are
still required.
