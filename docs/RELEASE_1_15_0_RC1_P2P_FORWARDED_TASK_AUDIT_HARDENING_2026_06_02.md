# MUSU 1.15.0-rc.1 P2P Forwarded Task Audit Hardening

**Wiki ID**: wiki/573
**Date**: 2026-06-02 23:35 KST
**Status**: Implemented and locally validated. Packaged MSIX evidence must be refreshed after commit because Rust source changed.

## Verdict

This closes one concrete P2P audit gap: when a peer sends a task to
`POST /api/tasks/forward`, the receiving bridge now writes an `audit_log` row
after the forwarded task is accepted and spawned locally.

This does not make public P2P release-ready. It improves forensic coverage for
cross-machine command execution, but release remains blocked by the existing
second-PC route/CPU/matrix evidence, live `musu.pro` P2P KV owner-scope
evidence, `musu@musu.pro` mailbox evidence, Store evidence, and release-grade
QUIC/TLS route transport.

## What Changed

Code:

- `musu-rs/src/bridge/handlers/forward.rs`
  - `receive_forwarded` now extracts `ConnectInfo<SocketAddr>` to capture the
    real peer client IP.
  - after successful local `TaskSpec` spawn, it writes an audit entry:
    - `method=POST`
    - `path=/api/tasks/forward`
    - `status_code=202`
    - `cross_machine=true`
    - `company_id` copied from the forwarded task metadata
    - `note` includes bounded task/source/rendezvous identifiers
  - the audit note intentionally excludes prompt text, cwd, callback URL, model,
    and adapter metadata to avoid unnecessary sensitive-data leakage.

Test:

- Added `forwarded_task_audit_note_is_bounded_and_excludes_prompt`.
- This pins the important security property: audit metadata is bounded and does
  not include prompt/cwd/callback content.

## Product Spec Delta

P2P command execution now has two complementary traces:

- route evidence: source-side and runtime route attempt evidence for path,
  timing, identity/encryption status, relay fallback evaluation, and result
  classification.
- audit log: target-side receipt of an accepted forwarded task, including the
  real peer socket IP from `ConnectInfo` and `cross_machine=true`.

This is the correct boundary for the current product:

- audit proves the target bridge accepted a cross-machine task;
- route evidence proves what path was attempted and whether it can be graded;
- neither should claim release-grade internet P2P until QUIC/TLS and live
  second-PC proof exist.

## Code Audit

Finding fixed:

- `receive_forwarded` accepted and spawned cross-machine work without a target
  node audit row. Other mutation/control paths already used the existing audit
  schema, so this was an auditability gap specific to P2P task receipt.

Residual issues:

- Rejected malformed forwarded-task requests are still not explicitly audited.
  The immediate release-risk reduction is successful command acceptance; reject
  audit can be added later with a careful multipart/error path so it does not
  leak raw request bodies.
- `/api/tasks/forward` still depends on bridge bearer authentication and the
  current transport proof state. This change does not add peer authorization
  policy, RBAC, or command allowlist gates for forwarded tasks.
- Packaged primary evidence is stale after this Rust source edit until a fresh
  MSIX build/install and primary smoke/process/CPU/matrix evidence refresh are
  recorded.

## Validation

Passed locally:

```powershell
cargo fmt --manifest-path .\musu-rs\Cargo.toml
cargo check --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1
cargo test --manifest-path .\musu-rs\Cargo.toml --lib forwarded_task_audit_note_is_bounded_and_excludes_prompt -- --test-threads=1
```

Test result:

- focused Rust unit test: `1 passed; 0 failed`
- `cargo check --bin musu`: passed

## Next Steps

1. Refresh docs/wiki/index and commit this hardening.
2. Push and verify CI.
3. If this commit is to be treated as the current release candidate, rebuild and
   reinstall the local-sideload MSIX, then refresh primary evidence:
   - desktop single-instance
   - process ownership
   - single-machine smoke
   - desktop-open CPU
   - four-state runtime CPU matrix
4. Continue external blockers:
   - second-PC route/CPU/matrix evidence
   - live `musu.pro` KV-backed P2P owner-scope evidence
   - release-grade QUIC/TLS route proof
   - `musu@musu.pro` mailbox evidence
   - Partner Center / Microsoft Store evidence
