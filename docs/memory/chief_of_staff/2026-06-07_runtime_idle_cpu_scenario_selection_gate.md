# 2026-06-07 Runtime Idle CPU Scenario Selection Gate

Clean go/no-go exposed a release-gate selection bug after targeted
`startup-open` evidence was added under `docs\evidence\runtime-idle-cpu`.

Problem:

- runtime idle CPU gate selected recent candidates per machine;
- the newer `startup-open` evidence masked the older release-gated
  `desktop-open` evidence;
- `runtime_idle_cpu_valid_machine_count` dropped to `0` even though the
  desktop-open evidence was still valid.

Fix:

- `write-release-go-no-go.ps1` now selects up to 12 recent runtime idle CPU
  candidates per machine;
- candidate selection label is `latest-per-machine-up-to-12`;
- `test-release-evidence-verifiers.ps1` source-contract coverage now checks
  the runtime idle selection behavior.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RUNTIME_IDLE_CPU_SCENARIO_SELECTION_GATE_2026_06_07.md`

Expected verification:

- release verifier regression `104/104`
- clean go/no-go restores `runtime_idle_cpu_valid_machine_count=1`
