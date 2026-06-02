# 2026-06-03 MSIX Alias Shadow Warning Policy

MSIX install evidence now separates public release proof from developer
diagnostics.

Durable facts:

- default `capture-msix-install-evidence.ps1` remains
  `AliasShadowingMode=fail`
- default `verify-msix-install-evidence.ps1` remains
  `AliasShadowingMode=fail`
- warning mode is explicit:
  `AliasShadowingMode=warn-explicit-windowsapps`
- warning mode requires the packaged WindowsApps alias to exist, be
  discoverable, and provide `windowsapps_alias_invocation`
- verifier accepts warning evidence only when both the evidence and verifier
  opt into `warn-explicit-windowsapps`
- startup/bin legacy conflicts still fail; only alias-shadow-only legacy
  conflicts can be accepted in warning mode

HUGH_SECOND warning evidence:

- `.local-build\msix-install-shadow-warning\20260603-080717-HUGH_SECOND.evidence.json`
- installed package:
  `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`
- shadowing path:
  `C:\Users\empty\.cargo\bin\musu.exe`
- packaged alias:
  `C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe`
- default verifier rejects it with `fail_count=4`
- warning verifier accepts it with `fail_count=0`
- warning recorder wrote local diagnostic output:
  `.local-build\msix-install-shadow-warning-recorded\20260603-080722-HUGH_SECOND.evidence.json`
- local diagnostic evidence SHA256:
  `fd76a3204e08cb02a05034b57a6173e236cd9838dc2fb0a042a727648143649d`
- local diagnostic verification SHA256:
  `22dc8ca32ddea784a896bec475a2e524801248ee4b10ded82ade70adf5ea2232`

Regression:

- `test-release-evidence-verifiers.ps1 -Json` passed `17/17`
- dirty-tree `write-release-go-no-go.ps1 -ScriptTimeoutSeconds 120 -Json`
  kept `msix_install_verified=true` using canonical clean HUGH-MAIN evidence
  with `alias_shadowing_mode=fail`; warning evidence was not used as the public
  release gate
- clean post-commit go/no-go at 2026-06-03 08:15 KST reports
  `local_artifacts_ready=true`, `single_machine_verified=true`,
  `msix_install_verified=true`, `msix_desktop_entrypoint_verified=true`,
  `public_metadata_ok=true`, `manifest_git.dirty=false`, and public No-Go
- explicit packaged alias indexing recorded `1634` files and `2283` symbols

Canonical report:

- `docs\RELEASE_1_15_0_RC1_MSIX_ALIAS_SHADOW_WARNING_POLICY_2026_06_03.md`
