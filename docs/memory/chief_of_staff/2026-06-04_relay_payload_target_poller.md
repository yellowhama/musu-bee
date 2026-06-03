# 2026-06-04 relay payload target poller

Added an opt-in target-side relay payload poller to the Rust bridge.

Key points:

- default off behind `MUSU_ENABLE_RELAY_PAYLOAD_POLLER`
- shared drain primitive `drain_relay_payloads_for_local_target(...)`
- poll interval default `60s`, floor `30s`
- empty/failure backoff default `300s`, hard ceiling `3600s`
- per-cycle claim limit defaults to `1`, clamps to `1..5`
- poller sleeps before the first cycle
- sleep runs under `tokio::select!` with a `CancellationToken`
- `musu doctor` reports poller background profile fields
- Rust background-loop audit now gates the poller loop contract

Validation:

- relay payload tests passed `19/19`
- doctor background tests passed `5/5`
- `cargo check --bin musu` passed
- Rust background-loop audit passed with `ok=true`, `fail_count=0`, and
  `unaudited_loop_hit_count=0`
- `git diff --check` passed

Interpretation: this is bounded opt-in target polling evidence, not
release-grade relay transport. Public release still needs production atomic
claim hardening, QUIC/TLS relay proof, hosted proof evidence, fresh packaged
evidence, second-PC evidence, support mailbox evidence, and Store evidence.
