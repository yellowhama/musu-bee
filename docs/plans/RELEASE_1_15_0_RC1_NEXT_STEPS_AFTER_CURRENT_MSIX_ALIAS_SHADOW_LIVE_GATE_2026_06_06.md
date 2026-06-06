# Next Steps After Current MSIX Alias Shadow Live Gate

## Current State

The current machine has a real PATH conflict:

- terminal `musu` resolves to `C:\Users\empty\.cargo\bin\musu.exe`
- packaged MUSU is available at
  `C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe`
- MUSU Desktop/runtime processes are packaged, but terminal commands can still
  hit the developer binary unless invoked explicitly

`write-release-go-no-go.ps1` now blocks on that live state.

## Next Actions

1. Clear or intentionally route around alias shadowing.
   - Preferred release path: move WindowsApps before `.cargo\bin` in PATH.
   - Diagnostic fallback: invoke the packaged alias explicitly in every command.
   - Do not delete developer binaries unless the operator intentionally retires
     that toolchain.

2. Re-run live conflict check.
   - `scripts/windows/check-msix-legacy-conflicts.ps1 -FailOnProblem -Json`
   - Required result: `ok=true`, `alias_shadowing_count=0`.

3. Re-capture clean primary evidence from current HEAD.
   - single-machine smoke
   - `desktop-open` idle CPU, 60s
   - five-scenario runtime CPU matrix
   - targeted HUGH-MAIN post-route CPU diagnostic

4. Continue the second-PC work.
   - install the same current package
   - capture MSIX install, process/startup, idle CPU, runtime matrix, and route
     evidence
   - import the return zip with release-gate evidence required

5. Continue hosted MUSU.PRO P2P evidence.
   - use the packaged WindowsApps `musu.exe login`
   - prove owner-scoped relay lease storage
   - prove release `quic_relay_tunnel` route transport and payload delivery

## Non-Goals

- Do not use `localhost:3001` availability as product readiness.
- Do not satisfy release evidence with `musu 1.15.0-dev`.
- Do not move local execution into MUSU.PRO.

