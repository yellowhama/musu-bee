# 2026-06-02 10:12 KST - Health Poll Backoff Hardening

wiki/544 records a local runtime hardening pass for bridge `/health` polling.

Code changed:

- `musu up` bridge startup wait now polls `/health` with 250ms -> 500ms -> 1s
  -> 2s capped backoff and does not sleep past the operator timeout.
- auto-update post-swap health polling now uses the same capped backoff within
  the existing 30s rollback deadline.

Validation:

- `cargo fmt --manifest-path .\musu-rs\Cargo.toml`
- `cargo test --manifest-path .\musu-rs\Cargo.toml --lib -j 1 health_poll_delay`
  passed 2/2 targeted tests.
- `git diff --check` passed.

Product status:

- This reduces a known local busy-loop candidate but does not close the runtime
  CPU gate.
- Because Rust runtime source changed, fresh MSIX install plus primary smoke,
  process ownership, desktop-open CPU, and four-state CPU matrix evidence must
  be regenerated before current HEAD is evidence-current.
- Public release remains No-Go on second-PC CPU/matrix, release-grade route,
  live `musu.pro` P2P relay lease owner-scope evidence, `musu@musu.pro`, and
  Store/Partner Center evidence.
