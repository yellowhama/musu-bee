# 2026-06-02 13:05 KST - Operator API security hardening

Code audit found that `musu-bee` worker proxy routes were too open for public release:

- `/api/nodes/execute` could forward caller-provided command/args to a configured worker.
- `/api/processes/start` could forward arbitrary process start requests.
- `/api/processes/kill` could forward PID termination requests.
- `/api/processes` could proxy remote `device_id` process listing.

Implemented hardening:

- Added `musu-bee/src/lib/operator-api-security.ts`.
- The four routes now require authenticated operator identity.
- Node execute defaults to diagnostic command allowlist via `MUSU_NODE_EXECUTE_ALLOWLIST`.
- Process start fails closed unless `MUSU_PROCESS_START_ALLOWLIST` is configured.
- Process kill fails closed unless `MUSU_ENABLE_PROCESS_KILL=1`.
- Remote process proxying fails closed unless `MUSU_ENABLE_REMOTE_WORKER_PROXY=1`.
- User-supplied env values are no longer forwarded to process start.
- Accepted/rejected mutations write `~\.musu\audit\command-center.jsonl`.

Validation passed:

- `npm run test:routes` 12/12
- `npm run typecheck`
- `npm run build`
- `git diff --check`
- `scripts\windows\audit-operator-api-security-contract.ps1 -FailOnProblem -Json` => `ok=true`, `fail_count=0`

Product spec update: `musu.pro` / MUSU Desktop operator process and node mutation APIs are privileged operator actions, not anonymous local conveniences. Broad process start remains out of scope until a named command catalog, approval policy, RBAC, and richer audit metadata exist.

Public release remains No-Go on external/current evidence gates: second-PC CPU/matrix/route, KV-backed live P2P owner-scoped control plane, `musu@musu.pro` mailbox evidence, and Store evidence.
