# 2026-06-02 11:14 KST - Relay Idle Hardening

Dashboard cloud relay is now an on-demand fallback instead of mount-time
background work.

Change:

- `musu-bee/src/components/dashboard/DashboardClient.tsx` no longer fetches
  `/api/account/relay-token` on dashboard mount.
- It no longer auto-connects the relay WebSocket when `relayInfo` and
  `selectedNode` exist.
- `Connect` lazily fetches the relay token with the existing `5s` timeout.
- Selected-node changes and unmount abort pending relay-token fetches, clear
  retry timers, and close relay WebSocket state.
- Relay reconnect remains bounded to `5` attempts after a user-initiated
  connection.
- `musu-bee/src/app/runtime-polling-contract.test.ts` now guards this
  on-demand relay contract.

Validation:

- `npx tsx --test src/app/runtime-polling-contract.test.ts`: `8/8`
- `npm run typecheck`: passed
- `npm run lint -- --quiet`: passed
- `npm run build`: passed
- `git diff --check`: passed

Interpretation:

- This aligns dashboard behavior with the MUSU control-plane model: relay is a
  fallback path, not a default idle path.
- This is runtime source, so fresh MSIX smoke/process/desktop-open CPU/matrix
  evidence is required after commit before current-HEAD release evidence can be
  claimed.
- Public release remains No-Go until second-PC CPU/matrix/route, live
  `musu.pro` P2P owner-scoped relay/control-plane evidence, `musu@musu.pro`,
  and Store evidence pass.
