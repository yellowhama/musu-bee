# 1.15.0-rc.1 Rendezvous Selector Candidate Metadata

Date: 2026-06-05
Wiki: wiki/737

## Summary

Rust rendezvous path selection now uses the public/NAT/relay candidate metadata
that `musu.pro` preserves and local MUSU programs can publish.

This keeps `musu.pro` as the control plane. It does not make the web server the
default data path and it does not promote relay to release-grade transport.

## Change

- Direct candidates select `public_addr` when present.
- Selected peer metadata preserves:
  - original `candidate_addr`
  - `selected_addr_source`
  - `public_addr`
  - `nat_type`
  - `nat_observed_by`
  - relay fallback descriptors under `relay_candidates`
- Relay candidates remain excluded from default route selection.

## Validation

- `cargo test --manifest-path .\musu-rs\Cargo.toml --bin musu rendezvous -- --nocapture`
  - `6/6`
- `cargo check --manifest-path .\musu-rs\Cargo.toml --bin musu`
- `scripts\windows\audit-p2p-store-forward-relay-contract.ps1 -Json`
  - `ok=true`
  - `fail_count=0`
- `git diff --check`

## Release Status

This closes the selector-side gap after room presence/rendezvous metadata
preservation and local CLI candidate publishing.

It does not close public release. Remaining blockers:

- fresh packaged MSIX/single-machine/idle CPU/runtime matrix evidence after this
  Rust source change
- second-PC current-build route, CPU, and matrix evidence
- hosted P2P KV/Upstash configuration
- release relay tunnel transport proof
- live owner-scoped relay route and payload delivery proof
- support mailbox evidence
- Store/Microsoft evidence

