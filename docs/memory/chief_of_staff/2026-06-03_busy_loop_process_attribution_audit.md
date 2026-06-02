# 2026-06-03 Busy-Loop and Process Attribution Audit

Current HEAD `6f32d490` was rechecked against the operator-reported CPU
busy-loop and machine-wide Node concerns.

Validation:

- `cargo test --manifest-path .\musu-rs\Cargo.toml --lib -j 1 peer::mdns::tests::`
  passed 3/3.
- `npm run test:runtime-polling` passed 11/11.

Audit conclusion:

- mDNS remains default-off; IPv6, Tailscale, and VPN/virtual interfaces require
  separate opt-in env vars.
- mDNS browse receiver disconnects break the discovery window immediately.
- frontend low-duty polling and reconnect contracts remain bounded.
- bridge cloud registration is a low-duty heartbeat, not a tight loop.
- `useFleetStore` has no fixed EventSource reconnect timer; its `setTimeout`
  calls are UI state resets.

Live process attribution at 2026-06-03 05:35 KST wrote
`.local-build\process-ownership\musu-process-ownership-20260603-053549.json`.
It failed release evidence because MUSU was not running and the bridge registry
was missing. It found 16 machine-wide `node.exe` processes and 6 WebView2
helpers, all outside the MUSU process tree, with orphan repo helpers `0`.

Release interpretation:

- Treat machine-wide Node/WebView2 count as diagnostic unless owned by MUSU or
  repo-related orphan helpers.
- Latest release-grade desktop-open CPU evidence remains
  `20260603-035458-HUGH_SECOND.desktop-open` and passes with MUSU `0`, Node
  `0.03`, WebView2 `0.6`, and hot process count `0`.
- Public release remains No-Go on second-PC route/CPU/matrix, live `musu.pro`
  P2P owner scope, support mailbox proof, and Store evidence.
