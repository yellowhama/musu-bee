# 2026-06-05 Rendezvous selector candidate metadata

Rust rendezvous selection now consumes MUSU.PRO candidate metadata instead of
only preserving/publishing it.

Key facts:

- file changed: `musu-rs/src/bridge/rendezvous.rs`
- direct candidates use `public_addr` as selected address when present
- selected peer metadata preserves `candidate_addr`, `selected_addr_source`,
  `public_addr`, `nat_type`, `nat_observed_by`, and relay fallback descriptors
- relay remains fallback-only and excluded from default route selection

Validation:

- `cargo test --manifest-path .\musu-rs\Cargo.toml --bin musu rendezvous -- --nocapture`
  passed `6/6`
- `cargo check --manifest-path .\musu-rs\Cargo.toml --bin musu` passed
- `audit-p2p-store-forward-relay-contract.ps1 -Json` passed with `ok=true`,
  `fail_count=0`
- `git diff --check` passed

Release implication:

- current packaged primary evidence predates this Rust source change
- fresh MSIX/single-machine/idle CPU/runtime matrix evidence is required before
  current-source local runtime gates can be claimed again
- public release remains No-Go on second-PC, hosted P2P release proof, support
  mailbox, and Store evidence

