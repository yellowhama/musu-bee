# 2026-06-02 15:00 KST - Runtime reconnect backoff hardening

Summary:

- Dashboard relay WebSocket reconnect no longer uses a fixed retry delay.
  `DashboardClient.tsx` now uses capped backoff from `5s` to `60s`, preserves
  the existing 5-attempt limit, and clears retry delay state on success,
  explicit disconnect, selected-node change, and unmount.
- Chat task SSE reconnect now has explicit `1s` initial delay, `2x` multiplier,
  `10s` cap, pending-timer cleanup, `EventSource.CONNECTING` suppression, and
  `reconnectGenerationRef` so stale timers cannot reconnect after channel/node
  changes or unmount.
- Added `npm run test:runtime-polling` and wired it into GitHub Actions before
  route and P2P tests.
- Expanded `runtime-polling-contract.test.ts` from 8 to 10 tests to guard the
  reconnect contracts.

Validation:

- `npm run test:runtime-polling`: 10/10 passed
- `npm run typecheck`: passed
- `npm run test:routes`: 12/12 passed
- `npm run test:p2p`: 21/21 passed
- `npm run build`: passed
- `npm run lint`: 0 errors, existing warning-only state
- `git diff --check`: passed

Qualitative audit:

- This reduces a real idle-work risk class: failed network reconnect paths that
  can keep scheduling work while the desktop UI is idle.
- Blast radius is limited to dashboard relay and chat SSE.
- The change does not prove the operator-observed busy-loop is fully closed.
  Installed MSIX CPU evidence must be refreshed after commit, and second-PC
  runtime CPU/matrix evidence is still required.
- Machine-wide `node.exe` count remains diagnostic only; release decisions must
  continue to use MUSU-owned helper attribution and CPU samples.

Docs updated:

- `docs/RELEASE_1_15_0_RC1_RUNTIME_RECONNECT_BACKOFF_HARDENING_2026_06_02.md`
- `docs/RELEASE_1_15_0_RC1_CURRENT_HEAD_EVIDENCE_QUAL_AUDIT_NEXT_STEPS_2026_06_02.md`
- `docs/RELEASE_1_15_0_RC1_FRONTEND_POLLING_TIMEOUT_AUDIT_2026_06_02.md`
- `docs/BETA_RELEASE_CHECKLIST_1_15_0_RC1.md`
- `docs/PRODUCT_CHARTER/NETWORK_BOUNDARY_SPEC.md`
- `docs/MUSU_RUNTIME_STABILIZATION_EXECUTION_PLAN_2026_05_31.md`
- `docs/GOAL.md`
- `docs/WIKI.md`
- `docs/WIKI_INDEX.md`

Remaining gates:

- fresh current-HEAD primary MSIX runtime evidence after commit
- second-PC idle CPU and four-state runtime CPU matrix evidence
- release-grade multi-device route evidence
- production KV-backed `musu.pro` P2P owner-scope evidence
- `musu@musu.pro` mailbox evidence
- Partner Center / Store evidence
