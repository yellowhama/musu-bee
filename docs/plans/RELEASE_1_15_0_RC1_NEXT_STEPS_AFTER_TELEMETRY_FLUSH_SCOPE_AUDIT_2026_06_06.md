# Next Steps After Telemetry Flush Scope Audit

## Current State

Rust background-loop auditing now treats log/telemetry flush primitives as a
scoped release contract. The current source has one allowed one-shot TTY prompt
flush in uninstall confirmation and zero disallowed background telemetry/log
flush workers.

## Next Actions

1. Keep `audit-rust-background-loop-contract.ps1` in every final operator gate
   packet so future release packets prove the same idle/background-loop scope.
2. If telemetry/exporter plumbing is added later, require an explicit low-duty
   design, cancellation story, opt-in/config gate, and release CPU evidence
   before allowlisting it.
3. Keep frontend polling, Rust loop/spawn, filesystem watcher, network watcher,
   and telemetry flush audits together in the local-runtime idle gate.
4. Continue hosted P2P work separately:
   - implement real `quic_relay_tunnel` payload transport
   - keep preview `http_store_forward_preview` queue proof non-release-grade
   - record owner-scoped `https://musu.pro` relay transport and delivery proof
5. Run the second-PC release kit on a separate installed machine and import:
   - successful route evidence
   - desktop-open idle CPU evidence
   - full runtime CPU scenario matrix evidence
6. Record support mailbox and Microsoft Store evidence before public release.

## Non-Goals

- Do not count one-shot CLI prompt flushing as a background telemetry worker.
- Do not add default telemetry/exporter loops to MUSU Desktop without explicit
  release evidence.
- Do not move local task execution into MUSU.PRO.
