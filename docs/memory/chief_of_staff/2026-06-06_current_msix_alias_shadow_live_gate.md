# 2026-06-06 current MSIX alias shadow live gate

## Decision

Current Windows MSIX legacy conflicts must be checked live during go/no-go,
not inferred only from previous install evidence.

## Evidence

- `where.exe musu` on `HUGH_SECOND` resolves
  `C:\Users\empty\.cargo\bin\musu.exe` before the WindowsApps alias.
- terminal `musu --version` returns `musu 1.15.0-dev`.
- explicit WindowsApps alias returns `musu 1.15.0-rc.1`.
- running MUSU Desktop and bridge processes are packaged WindowsApps processes.
- 60s dirty-tree `desktop-open` CPU diagnostic passed:
  MUSU `0.03`, Node `0.0`, WebView2 `0.08`, `bridge_runtime=1`,
  `desktop_shell=1`, `webview2_helper=6`.

## Change

- `write-release-go-no-go.ps1` runs `check-msix-legacy-conflicts.ps1 -Json`
  and exposes `msix_current_legacy_conflicts_ok`.
- The release gate now blocks with `msix-current-legacy-conflicts` when the
  current machine has startup helper, scheduled task, legacy bin, or PATH alias
  conflicts.
- `test-release-evidence-verifiers.ps1` source-contracts the new live gate.

## Validation

- parser check: pass
- release verifier regression: `60/60`
- frontend polling audit: `ok=true`
- Rust background-loop audit: `ok=true`
- dirty-tree go/no-go exposed `msix_current_legacy_conflicts_ok=false`

## Product Status

No 20% CPU busy-loop reproduced in the current desktop-open diagnostic.
Public release remains No-Go on alias shadowing, fresh clean evidence,
second-PC evidence, hosted P2P proof, support mailbox, and Store evidence.

