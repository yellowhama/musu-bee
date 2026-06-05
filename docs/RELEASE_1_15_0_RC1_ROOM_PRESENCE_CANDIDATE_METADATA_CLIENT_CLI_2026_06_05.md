# RC1 Room Presence Candidate Metadata Client CLI

Date: 2026-06-05 09:06 KST

## Summary

The local MUSU Rust program can now publish the same public endpoint, NAT, and
relay fallback candidate metadata that `musu.pro` already preserves through
room presence, candidate cache seeding, and rendezvous creation.

This aligns the product split:

- local MUSU programs execute work and own local files/processes
- `musu.pro` accepts remote user input, hosts project rooms, exchanges device
  presence, helps with rendezvous/path selection, records evidence, and issues
  relay fallback only after direct paths fail
- `localhost:3001` remains an optional workspace dashboard, not the installed
  local app

## Implementation

- Added Rust DTO enums:
  - `NatType`
  - `RelayProtocol`
- Extended `CandidateEndpoint` with optional fields:
  - `public_addr`
  - `nat_type`
  - `nat_observed_by`
  - `relay_url`
  - `relay_protocol`
- Extended `musu room presence publish`:
  - repeated `--candidate-url`
  - `--nat-type`
  - `--nat-observed-by`
  - `--relay-url`
  - `--relay-protocol`
- Kept the default local bridge candidate path intact.
- Attached NAT metadata only to public/direct candidates.
- Added relay candidates as explicit fallback descriptors.
- Kept backward-compatible JSON report field `candidate` and added full
  `candidates`.

## Validation

- `cargo check --manifest-path .\musu-rs\Cargo.toml --bin musu` passed.
- `cargo test --manifest-path .\musu-rs\Cargo.toml --bin musu room_presence -- --nocapture`
  passed `6/6`.
- `cargo test --manifest-path .\musu-rs\Cargo.toml --bin musu rendezvous -- --nocapture`
  passed `5/5`.
- `npm run test:p2p` passed `79/79`.
- `npm run typecheck` passed.
- `audit-p2p-store-forward-relay-contract.ps1 -Json` passed with `ok=true`
  and `fail_count=0`.
- `git diff --check` passed.

## Release Status

This is client-side P2P control-plane contract hardening. It does not close the
public release gates.

Fresh packaged runtime evidence is required after this Rust source change:

- strict MSIX install evidence
- single-machine smoke evidence
- idle CPU evidence
- runtime CPU scenario matrix evidence

The release still also needs:

- second-PC install, route, CPU, and matrix evidence
- hosted `musu.pro` production KV/Upstash configuration
- release-grade relay connect/payload transport proof
- owner-scoped route/relay evidence
- support mailbox evidence
- Store/Microsoft approval evidence
