# 1.15.0-rc.1 Low-Duty Polling Default Timeout Hardening

**Date**: 2026-06-03 02:51 KST  
**Wiki ID**: wiki/580  
**Scope**: frontend shared polling hardening, qualitative audit, next release gates

## Change

`musu-bee/src/lib/useLowDutyPolling.ts` now gives every shared low-duty polling
task a default timeout:

- `DEFAULT_LOW_DUTY_POLL_TASK_TIMEOUT_MS = 10_000`
- callers can still override `taskTimeoutMs`
- callers that omit `taskTimeoutMs` now get `AbortSignal.timeout(...)` and
  `AbortSignal.any(...)` cancellation by default

The runtime polling contract test now asserts the default timeout constant and
default option binding, so a future edit cannot silently remove this guard.

## Why

The code audit found that most visible frontend refresh loops already use
`useLowDutyPolling`, but some callers do not pass an explicit `taskTimeoutMs`.
That means a slow or stuck fetch path could keep a poll task in flight longer
than intended. The hook already suppresses overlapping runs; this change adds a
default task bound so omitted timeout settings do not become unbounded work.

This is not a claim that all idle CPU risk is gone. It is a narrow hardening
step against frontend polling hangs. Remaining runtime risk still includes:

- real second-PC idle CPU and four-state CPU matrix evidence
- mDNS/Tailscale IPv6 error-spam behavior when mDNS is explicitly enabled
- live `musu.pro` P2P KV/Upstash owner-scoped relay lease evidence
- release-grade transport proof for routed/relayed work

## Validation

Passed locally:

- `npx tsx --test src/app/runtime-polling-contract.test.ts` - 10/10
- `npm run typecheck`
- `npm run build`
- `git diff --check`

## Qualitative Evaluation

Current qualitative status remains:

- local desktop/dogfood path: good enough to keep iterating
- public Microsoft Store release: No-Go
- release blocker class: evidence and control-plane readiness, not basic UI
  implementation

The shared polling guard improves the hardening score because it removes an
implicit unbounded-work path across many UI polling surfaces. It does not close
the user's reported busy-loop issue by itself. The next real proof still has to
come from fresh packaged primary evidence plus second-PC CPU evidence after this
source change.

## Release Caveat

This is a frontend source change. The latest packaged MSIX/primary evidence is
therefore stale until the local-sideload MSIX is rebuilt and primary
single-machine, desktop-open CPU, process-ownership, single-instance, and
runtime CPU matrix evidence are refreshed from the new commit.

Public release remains blocked by:

- second-PC CPU/matrix/route evidence
- live `musu.pro` owner-scoped P2P KV/Upstash evidence
- release-grade direct or relay transport proof
- `musu@musu.pro` mailbox evidence
- Partner Center/Store evidence

