# 2026-06-01 14:55 KST - CPU Matrix Scenario Argument Fix

During primary CPU matrix capture, the command:

```powershell
powershell -File scripts\windows\measure-musu-runtime-cpu-scenarios.ps1 -Scenario runtime-started dashboard-open desktop-open post-route ...
```

only measured `runtime-started`. Under `powershell -File`, the extra scenario
tokens were not recoverable as script unbound arguments.

Fix:

- Operator packet, multi-device kit, release test plan, and handoff status
  commands now use comma-separated scenarios:
  `-Scenario runtime-started,dashboard-open,desktop-open,post-route`.
- `measure-musu-runtime-cpu-scenarios.ps1` now normalizes comma-separated
  scenario values before measurement.

Validation:

- Dirty-tree 3s comma smoke
  `.local-build\runtime-cpu-scenarios\20260601-145441-HUGH_SECOND\20260601-145441-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
  recorded `requested_scenarios` as `runtime-started` and `dashboard-open`.
- This is harness validation only, not release evidence.
