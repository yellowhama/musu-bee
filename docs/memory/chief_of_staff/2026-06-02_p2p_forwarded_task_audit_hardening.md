# CoS Memory: P2P Forwarded Task Audit Hardening

Date: 2026-06-02 23:35 KST

Durable memory:

- `musu-rs/src/bridge/handlers/forward.rs` now writes a target-side
  `audit_log` row when `/api/tasks/forward` accepts and spawns a forwarded
  cross-machine task.
- The audit row uses the real peer IP from `ConnectInfo<SocketAddr>`, sets
  `method=POST`, `path=/api/tasks/forward`, `status_code=202`,
  `cross_machine=true`, and carries the forwarded task `company_id`.
- The audit note includes bounded task/source/rendezvous identifiers only. It
  intentionally excludes prompt text, cwd, callback URL, model, and adapter
  metadata.
- Validation passed:
  `cargo check --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1` and
  focused unit test
  `forwarded_task_audit_note_is_bounded_and_excludes_prompt`.
- This improves P2P command forensics but does not close public release gates:
  second-PC route/CPU/matrix, live `musu.pro` KV owner-scope proof,
  `musu@musu.pro` mailbox evidence, Store evidence, and release-grade QUIC/TLS
  route transport remain required.
- Because Rust source changed, current packaged MSIX primary evidence is stale
  until the MSIX is rebuilt/reinstalled and primary evidence is refreshed.
