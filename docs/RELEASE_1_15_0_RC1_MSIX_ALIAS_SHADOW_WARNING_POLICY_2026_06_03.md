# MUSU 1.15.0-rc.1 MSIX Alias Shadow Warning Policy

Date: 2026-06-03 08:10 KST

## Summary

MSIX install evidence now has an explicit alias-shadowing policy instead of a
single ambiguous pass/fail result.

Default release behavior remains strict:

- `capture-msix-install-evidence.ps1` defaults to `AliasShadowingMode=fail`
- `verify-msix-install-evidence.ps1` defaults to `AliasShadowingMode=fail`
- clean public release evidence still requires WindowsApps to be the first
  resolved `musu.exe`

Developer diagnostics can now be recorded separately:

- `AliasShadowingMode=warn-explicit-windowsapps`
- requires the packaged WindowsApps alias file to exist
- requires the packaged alias to be discoverable by `Get-Command`
- requires `windowsapps_alias_invocation`
- records `alias_shadowing_accepted=true`
- records `alias_shadowing_release_gate=developer-warning-only`

This keeps HUGH_SECOND diagnosable without weakening the Store/public release
gate.

## Current HUGH_SECOND Evidence

Warning-mode capture succeeded:

- evidence:
  `.local-build\msix-install-shadow-warning\20260603-080717-HUGH_SECOND.evidence.json`
- installed package:
  `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`
- first alias path:
  `C:\Users\empty\.cargo\bin\musu.exe`
- packaged alias path:
  `C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe`
- `alias_shadowing_mode=warn-explicit-windowsapps`
- `alias_shadowing_accepted=true`
- `alias_shadowing_count=1`
- `startup_conflict_count=0`
- `legacy_conflict_count=1`

The same evidence verifies differently by mode:

- default verifier: rejected, `fail_count=4`
- warning verifier:
  `verify-msix-install-evidence.ps1 -AliasShadowingMode warn-explicit-windowsapps`
  passed with `fail_count=0`
- warning recorder wrote a local diagnostic archive:
  `.local-build\msix-install-shadow-warning-recorded\20260603-080722-HUGH_SECOND.evidence.json`
- diagnostic evidence SHA256:
  `fd76a3204e08cb02a05034b57a6173e236cd9838dc2fb0a042a727648143649d`
- diagnostic verification SHA256:
  `22dc8ca32ddea784a896bec475a2e524801248ee4b10ded82ade70adf5ea2232`

No warning-mode evidence was recorded into the canonical
`docs\evidence\msix-install\1.15.0-rc.1` release gate. That directory should
continue to represent clean public-release install proof.

## Code Audit

Changed scripts:

- `scripts\windows\capture-msix-install-evidence.ps1`
- `scripts\windows\verify-msix-install-evidence.ps1`
- `scripts\windows\record-msix-install-evidence.ps1`
- `scripts\windows\test-release-evidence-verifiers.ps1`

Audit result:

- default capture/verifier behavior is unchanged for release gates
- warning mode is opt-in
- verifier requires both the command-line opt-in and an evidence-side
  `alias_shadowing_mode=warn-explicit-windowsapps`
- warning mode also requires explicit packaged alias availability
- legacy conflicts are accepted only when the only conflict is alias shadowing
- startup/bin conflicts still fail
- regression coverage proves clean evidence passes, warning evidence fails by
  default, and warning evidence passes only with explicit verifier opt-in

## Validation

- PowerShell parser: all four changed scripts parse
- `test-release-evidence-verifiers.ps1 -Json`: `ok=true`,
  `case_count=17`, `failed_case_count=0`
- real warning-mode capture on HUGH_SECOND: `ok=true`
- real default verification of that capture: `ok=false`, `fail_count=4`
- real warning-mode verification of that capture: `ok=true`, `fail_count=0`
- warning-mode record to `.local-build`: `ok=true`
- dirty-tree go/no-go smoke at 2026-06-03 08:11 KST:
  `ready_for_public_desktop_release=false`, `local_artifacts_ready=true`,
  `single_machine_verified=true`, `msix_install_verified=true`, and the selected
  MSIX install evidence remains the canonical clean
  `docs\evidence\msix-install\1.15.0-rc.1\20260531-165211-HUGH-MAIN.evidence.json`
  with `alias_shadowing_mode=fail`
- clean post-commit go/no-go at 2026-06-03 08:15 KST:
  `ready_for_public_desktop_release=false`, `local_artifacts_ready=true`,
  `single_machine_verified=true`, `msix_install_verified=true`,
  `msix_desktop_entrypoint_verified=true`, `public_metadata_ok=true`, and
  `manifest_git.dirty=false`
- explicit packaged alias indexing:
  `1634` files, `2283` symbols

## Qualitative Status

This does not close a public release blocker by itself. It fixes the evidence
model so the project can distinguish three states:

- clean user/store machine: release-grade install evidence
- developer machine with a cargo/debug binary earlier in PATH: diagnostic
  warning evidence
- real startup/bin conflict: still a failure

The product remains public No-Go until second-PC CPU/matrix/route evidence,
release-grade live `musu.pro` KV/Upstash owner-scoped relay lease evidence,
relay payload transport proof, `musu@musu.pro` mailbox proof, and Partner
Center/Store evidence are recorded.
