# RELEASE 1.15.0-rc.1 Rust Format Gate Audit

**Wiki ID**: wiki/1166

Date: 2026-06-15 KST

Scope:

- `cargo fmt --manifest-path musu-rs\Cargo.toml -- --check`
- `musu-rs/src/bridge/handlers/forward.rs`
- Rust backend quality gate status after the Add PC backend timeout audit

## Verdict

The Rust formatting gate is now clean. The previous session left a real quality
gate failure: `cargo fmt --check` failed on `forward.rs`. The diff was purely
rustfmt normalization of callback context extraction and test `use` ordering,
not a behavioral change.

This matters because the broader goal is an adversarial full-codebase critique,
not just feature wiring. A product can have correct Add PC behavior and still be
below release quality if a basic source hygiene gate fails.

## Finding

### Fixed: backend format gate failed on a callback wiring file

Evidence before fix:

- `cargo fmt --manifest-path musu-rs\Cargo.toml -- --check` failed.
- The only reported source file was
  `musu-rs/src/bridge/handlers/forward.rs`.
- The required changes were:
  - split `callback_company_id` extraction into rustfmt-preferred closure shape
  - condense `callback_channel` / `callback_sender_id` extraction
  - reorder `use crate::peer::discovery::PeerSource` before
    `use axum::extract::State`

Change:

- Applied only rustfmt-equivalent formatting changes to `forward.rs`.
- No callback routing, DB query, SSE publish, proof recording, or task update
  behavior was changed.

## Verification

Passed:

- `cargo fmt --manifest-path musu-rs\Cargo.toml -- --check`
- `git diff --check`
- `$env:CARGO_INCREMENTAL='0'; cargo check --manifest-path musu-rs\Cargo.toml -p musu-rs -j 1`
  - finished in `2m 01s`

Environment note:

- A default `cargo check --manifest-path musu-rs\Cargo.toml -p musu-rs` attempt
  failed with Windows/MSVC `STATUS_IN_PAGE_ERROR (0xc0000006)`.
- The same source passed with `CARGO_INCREMENTAL=0` and `-j 1`, so the failure
  is classified as Windows incremental/toolchain I/O instability, not a source
  diagnostic.

## Qualitative Assessment

This is not a product-feature improvement by itself, but it is a release
quality improvement. The repo now has a clean Rust format gate again, which
makes future adversarial audits less noisy and prevents a known gate failure
from hiding real backend regressions.

Remaining risk:

- Windows/MSVC incremental compilation remains unstable in this workspace. For
  release proof, prefer `CARGO_INCREMENTAL=0 -j 1` or a clean WSL/GNU confirmation
  when the default MSVC path throws `STATUS_IN_PAGE_ERROR`.

Search terms should include `wiki/1166`, `Rust format gate audit`,
`cargo fmt --manifest-path musu-rs\\Cargo.toml -- --check`,
`forward.rs`, `callback_context`, `CARGO_INCREMENTAL=0`, and
`STATUS_IN_PAGE_ERROR`.
