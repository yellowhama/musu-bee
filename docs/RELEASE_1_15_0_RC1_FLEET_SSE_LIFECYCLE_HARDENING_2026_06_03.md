# MUSU 1.15.0-rc.1 Fleet SSE Lifecycle Hardening

Date: 2026-06-03 07:20 KST

## Scope

This pass addressed one remaining frontend busy-loop risk: the global Fleet
EventSource connection in `useFleetStore`.

Before this pass, the store closed the EventSource on error, but the lifecycle
was not explicitly bounded by a reconnect contract, and the pages that started
the connection did not close it on unmount. That was not proof of the reported
20% CPU issue, but it was a weak release-hardening point because global
connections need clear ownership, cleanup, and bounded retry behavior.

## Code Change

Changed:

- `musu-bee/src/store/useFleetStore.ts`
- `musu-bee/src/app/dashboard/fleet/page.tsx`
- `musu-bee/src/app/dashboard/agent/[id]/page.tsx`
- `musu-bee/src/app/runtime-polling-contract.test.ts`

New Fleet SSE behavior:

- one global EventSource remains enforced with `EventSource.CONNECTING` /
  `EventSource.OPEN` checks
- reconnect delay starts at `1_000ms`
- reconnect delay is capped at `10_000ms`
- reconnect multiplier is `2`
- retry attempts are capped at `5`
- stale reconnect timers are ignored by `fleetReconnectGeneration`
- active reconnect timers are cleared before opening or closing
- `closeSSE()` closes the active EventSource, clears timers, and resets retry
  state
- `/dashboard/fleet` and `/dashboard/agent/[id]` now call `closeSSE()` on
  unmount

## Validation

Passed:

- `npm run test:runtime-polling`: `12/12`
- `npm run typecheck`
- `npm run build`
- `git diff --check`

Clean HEAD after the code commit:

- commit: `aa23fc85c7caba0e05e3436df3aa3c64e3acfa39`
- `write-release-go-no-go.ps1 -Json -ScriptTimeoutSeconds 120`
- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=false`
- `multi_device_verified=false`
- `public_metadata_ok=true`
- `msix_install_verified=true`
- `msix_desktop_entrypoint_verified=true`
- `manifest_git.dirty=false`

The important regression is expected: this is frontend runtime source, so the
previous primary-machine smoke/desktop-open CPU/runtime matrix evidence no
longer proves the current HEAD. The next release-evidence step must rebuild and
install the MSIX for `aa23fc85`, then refresh primary evidence.

## Qualitative Evaluation

Product maturity improved slightly, but public release readiness is still
No-Go.

What improved:

- the global Fleet SSE connection now has an explicit lifecycle owner
- repeated SSE failure cannot become an unbounded reconnect loop
- stale reconnect timers cannot reopen a connection after a page has closed it
- the runtime-polling contract test now covers the Fleet store path
- the frontend build proves the changed pages still compile and prerender

What remains risky:

- current-head packaged desktop evidence is stale until a new MSIX evidence pass
  is recorded
- second-PC route/CPU/matrix evidence is still missing
- `musu.pro` P2P relay lease storage is still not release-grade because
  KV/Upstash is unconfigured
- relay payload transport remains unwired
- `musu@musu.pro` mailbox receipt/forward evidence is still missing
- Partner Center / Microsoft Store submission evidence is still missing

## Code Audit Result

No new fixed-delay busy-loop was added in this pass.

The audited Fleet SSE path now has:

- no `setInterval`
- bounded `setTimeout` reconnect
- retry cap
- stale-generation cancellation
- explicit close path
- page unmount cleanup

Residual audit note: other EventSource surfaces still exist in the application,
but most either close on unmount, fall back to low-duty polling, or are scoped
to pages/components rather than a global store. They should still be reviewed in
the next hardening pass, but the clearest global lifecycle gap is now closed.

## Next Roadmap

1. Rebuild/install MSIX for `aa23fc85` and refresh primary evidence:
   single-machine smoke, desktop-open CPU, runtime CPU scenario matrix.
2. Re-run clean go/no-go and confirm `single_machine_verified=true` is restored.
3. Run current second-PC operator pack on the second machine and return route,
   CPU, matrix, and cleanup evidence.
4. Configure release-grade KV/Upstash for `musu.pro` P2P relay lease storage,
   redeploy, and record owner-scoped live P2P evidence.
5. Wire and prove relay payload transport separately from relay lease issuance.
6. Record `musu@musu.pro` mailbox receive/forward evidence.
7. Prepare Partner Center / Microsoft Store submission evidence after the local
   and external gates are green.

## Bottom Line

This pass reduces a real hardening weakness, but it does not change the release
decision. MUSU remains No-Go for public desktop release until fresh current-HEAD
primary evidence and the external gates are recorded.
