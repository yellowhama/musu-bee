# MUSU 1.15.0-rc.1 Operator API Security Audit

**Wiki:** wiki/549  
**Date:** 2026-06-02 KST  
**Status:** fixed locally; public release remains No-Go on external evidence gates.

## Summary

The local hardening audit found a real operator API gap in `musu-bee`: several Next.js API routes proxied node/process actions to worker endpoints without requiring an authenticated operator session.

Fixed routes:

- `/api/nodes/execute`
- `/api/processes`
- `/api/processes/start`
- `/api/processes/kill`

## Finding

Before this change, `/api/nodes/execute` accepted `node_name`, `command`, and `args`, then forwarded the payload to `/execute/process`. `/api/processes/start` accepted an arbitrary command and `/api/processes/kill` accepted a PID. These routes were useful as local UI proxies, but they were not acceptable for a public `musu.pro` or packaged desktop release boundary.

Severity: High for public release.  
Reason: remote command/process mutation capability must not be reachable without user identity, command policy, and audit evidence.

## Fix

Added `musu-bee/src/lib/operator-api-security.ts`:

- requires authenticated `musu.pro` operator identity through `getUserFromRequest`
- adds `MUSU_NODE_EXECUTE_ALLOWLIST` for `/api/nodes/execute`
- adds fail-closed `MUSU_PROCESS_START_ALLOWLIST` for `/api/processes/start`
- adds explicit `MUSU_ENABLE_PROCESS_KILL` gate for `/api/processes/kill`
- adds explicit `MUSU_ENABLE_REMOTE_WORKER_PROXY` gate for remote `device_id` process proxying
- rejects control characters in forwarded arguments

Route changes:

- `/api/nodes/execute` now requires auth, clamps timeout to 1..30 seconds, permits only allowlisted diagnostic commands by default, and writes accepted/rejected/bridge-error audit events.
- `/api/processes` now requires auth and rejects remote worker proxying unless explicitly enabled.
- `/api/processes/start` now requires auth, fails closed unless the command basename is allowlisted, no longer forwards user-supplied env values, and writes audit events.
- `/api/processes/kill` now requires auth, fails closed unless `MUSU_ENABLE_PROCESS_KILL=1`, and writes audit events.

## Validation

Passing local checks:

```powershell
npm run test:routes
npm run typecheck
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\audit-operator-api-security-contract.ps1 -FailOnProblem -Json
```

Route security coverage:

- unauthenticated requests return 401 before worker fetch
- non-allowlisted node execute commands do not reach the worker
- process start fails closed when the allowlist is empty
- process kill fails closed unless explicitly enabled
- remote worker proxy is rejected by default
- accepted mutations write `~\.musu\audit\command-center.jsonl`

## Product Spec Update

MUSU Desktop / `musu.pro` operator API is now specified as authenticated and policy-gated:

- process/node mutation routes are not anonymous local conveniences
- public release builds must treat remote command/process APIs as privileged operator actions
- broad arbitrary process start remains out of scope until an approval policy and safer command catalog are added

## Qualitative Assessment

This improves hardening quality from "known unsafe prototype route exists" to "release candidate has an enforceable operator boundary for the exposed Next.js proxy routes." It does not make the whole product release-ready because second-PC evidence, P2P KV/control-plane evidence, support mailbox evidence, and Store certification evidence remain open.

The remaining risk is policy depth: current allowlists are deliberately narrow. The next product step should replace ad hoc process start with a named command catalog, approval gates, RBAC, and per-command audit metadata.
