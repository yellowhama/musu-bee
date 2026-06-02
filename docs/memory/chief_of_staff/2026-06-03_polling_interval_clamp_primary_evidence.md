# 2026-06-03 Polling Interval Clamp and Primary Evidence

`useLowDutyPolling` now clamps accidental tight frontend intervals:

- `MIN_LOW_DUTY_POLL_INTERVAL_MS = 5_000`
- `LOW_DUTY_HIDDEN_BACKOFF_MULTIPLIER = 4`
- hidden polling uses the effective interval floor
- document visibility listener is guarded for non-browser runtimes

Validation passed `npx tsx --test src/app/runtime-polling-contract.test.ts`
11/11, `npm run test:runtime-polling` 11/11, `npm run typecheck`,
`npm run build`, `npm run lint` with 0 errors and 74 existing warnings, and
`git diff --check`.

Fresh primary evidence after MSIX rebuild/install:

- single-machine `20260603-035325-HUGH_SECOND`
- desktop single-instance `20260603-035450-HUGH_SECOND`
- process ownership `20260603-035436-HUGH_SECOND`
- desktop-open CPU `20260603-035458-HUGH_SECOND`
- runtime CPU matrix `20260603-035608-HUGH_SECOND`
- route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_035608`

Desktop-open CPU: MUSU `0`, Node `0.03`, WebView2 `0.6`, working set
`500.44MB`, hot `0`. Process ownership: MUSU-owned Node `0`, owned WebView2
`6`, machine-wide Node `18`, orphan repo helpers `0`.

Clean go/no-go remains No-Go: runtime idle CPU and matrix are still `1/2`, and
multi-device, P2P control-plane, support mailbox, Store release, and local
runtime-package alias shadowing remain blockers. The local alias blocker is
`C:\Users\empty\.cargo\bin\musu.exe` before the WindowsApps alias.

Current operator handoff after docs commit:

- final packet `musu-final-operator-gates-1.15.0-rc.1-20260603-040654.zip`
  verified `ok=true`, `fail_count=0`, `kit_count=1`
- action pack `MUSU-1.15.0-rc.1-operator-action-pack-20260603-040714.zip`
  verified `ok=true`, `fail_count=0`
- second-PC transfer
  `MUSU-second-PC-transfer-1.15.0-rc.1-20260603-040714.zip`
- Partner Center zip
  `MUSU-1.15.0-rc.1-store-submission-20260603-040714.zip`
