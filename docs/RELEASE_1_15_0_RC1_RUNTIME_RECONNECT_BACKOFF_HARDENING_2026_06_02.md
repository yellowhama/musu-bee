# MUSU 1.15.0-rc.1 Runtime Reconnect Backoff Hardening

Date: 2026-06-02 15:00 KST
Wiki ID: wiki/553

## Scope

This pass follows the operator report that starting MUSU can leave busy-loop
style CPU usage on one core. Earlier work already made dashboard/background
polling use `useLowDutyPolling`, disabled mDNS by default, filtered virtual/VPN
mDNS interfaces, hardened mDNS disconnected-channel handling, made dashboard
cloud relay connection on-demand, and bounded release-gate scripts.

This pass targeted the remaining frontend reconnect candidates that were not
plain polling loops:

- dashboard cloud relay WebSocket reconnect
- chat task EventSource reconnect
- runtime polling contract coverage in local npm scripts and GitHub Actions

## Change

`musu-bee/src/components/dashboard/DashboardClient.tsx` now uses capped relay
WebSocket reconnect backoff instead of a fixed retry delay:

- initial delay: `5s`
- multiplier: `2x`
- cap: `60s`
- retry limit: existing `5` attempts
- reconnect timer is still cleared on disconnect, selected-node change, and
  unmount

`musu-bee/src/lib/useChat.ts` now hardens the task SSE reconnect path:

- explicit `1s` initial delay, `2x` multiplier, `10s` cap
- pending reconnect timer is cleared before scheduling a new one
- `EventSource.CONNECTING` is treated as an active connection attempt
- a reconnect generation guard prevents stale timers from reconnecting after
  channel changes, active-node changes, or unmount
- EventSource close/reset is centralized through cleanup helpers

`musu-bee/src/app/runtime-polling-contract.test.ts` now checks the relay and
SSE reconnect contracts, and `npm run test:runtime-polling` is wired into
`.github/workflows/test.yml`.

## Validation

From `F:\workspace\musu-bee\musu-bee`:

```powershell
npm run test:runtime-polling
npm run typecheck
npm run test:routes
npm run test:p2p
npm run build
npm run lint
git diff --check
```

Results:

- runtime polling contract: `10/10` passed
- typecheck: passed
- route security tests: `12/12` passed
- P2P control-plane tests: `21/21` passed
- production build: passed
- lint: `0` errors, existing warning-only state
- diff whitespace check: passed

## Qualitative Assessment

The idle CPU risk is lower than before because the app now has a coherent
frontend rule: polling uses a shared low-duty hook with timeout/backoff, and
network reconnect paths use bounded backoff plus cleanup. The change does not
prove the user's original busy-loop report is fully closed because the report
was runtime-observed and release policy requires evidence from installed MSIX
on two Windows machines.

The current qualitative grade for this specific hardening slice is:

- implementation: good
- blast radius: low to moderate, limited to dashboard relay and chat SSE
- test coverage: good for contract/regression coverage
- release evidence: not yet current-HEAD after this source change
- remaining risk: stale external Node processes and second-PC runtime behavior
  still need operator-visible evidence, not assumption

## Code Audit Notes

No broad refactor was introduced. The relay change keeps the existing
on-demand connection model and retry limit. The SSE change prevents duplicate
connecting EventSource instances and stale timers. The new tests are source
contract tests, so they do not replace browser/runtime evidence, but they do
guard the exact busy-loop class that can regress silently.

One important non-code observation remains: machine-wide `node.exe` process
count can be high even when MUSU-owned Node helpers are zero. Release reporting
must continue using process attribution, owned-helper counts, and CPU samples
instead of raw machine-wide Node count.

## Release Impact

This is runtime web source. After commit, current primary MSIX CPU evidence from
earlier HEADs must not be treated as current-HEAD release evidence. The next
evidence pass must rebuild/install MSIX and rerun:

- desktop single-instance
- process ownership
- single-machine smoke
- desktop-open idle CPU
- four-state runtime CPU scenario matrix

Public release remains No-Go until these gates pass:

- second-PC idle CPU and runtime CPU matrix, making runtime gates `2/2`
- release-grade multi-device route evidence
- live `musu.pro` P2P control-plane with KV-backed owner-scoped evidence
- `musu@musu.pro` support mailbox evidence
- Partner Center / Store evidence

## Next Actions

1. Commit and push this hardening slice.
2. Watch GitHub Actions for web build/typecheck, runtime polling contract,
   route security, P2P, and Rust core tests.
3. Regenerate current operator packet/action pack if this HEAD becomes the next
   operator handoff candidate.
4. Rebuild/install MSIX and rerun primary runtime evidence.
5. Send the updated second-PC transfer package and require returned runtime
   idle CPU, runtime matrix, and route evidence.
6. Provision production KV for `musu.pro` P2P relay lease storage and rerun
   live owner-scope evidence.
