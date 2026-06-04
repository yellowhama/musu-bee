# MUSU 1.15.0-rc.1 Room Presence Client CLI

Date: 2026-06-04 20:18 KST

## Summary

Added a local Rust CLI client for MUSU.PRO room presence:

- `musu room presence publish <room-id>`
- `musu room presence list <room-id>`

This closes the client-side gap after the room presence API. The server room
can now accept current presence records, and the installed local MUSU program
can publish its own executor status, route candidate, capabilities, active work
orders, and identity context into that room.

The product boundary remains unchanged: `musu.pro` is the remote input, project
room, company meeting room, presence, rendezvous, path-selection,
relay-fallback coordination, and evidence plane. The local MUSU program still
does the actual work on each device. Devices can use `musu.pro` to discover
each other and then prefer direct P2P mesh after web-assisted rendezvous.

## Contract

- `musu-rs` now has room presence DTOs and cloud client methods for
  `POST /api/rooms/[roomId]/presence` and
  `GET /api/rooms/[roomId]/presence`.
- `publish` builds a local route candidate from the resolved bridge URL or
  `--public-url`, classifies it as LAN, Tailscale, or direct QUIC, includes the
  endpoint scheme, and marks optional relay capability.
- `publish` defaults `origin=musu.local-program` and capability
  `bridge_http_forward`.
- `publish` includes the local TLS certificate fingerprint as `public_key`
  when it is available.
- `list` supports owner-scoped filters for company, project, node, source
  agent, status, limit, and expired records.
- Both commands support `--json` reports:
  `musu.room_presence_publish.v1` and `musu.room_presence_list.v1`.
- This is on-demand CLI behavior only. No background heartbeat, timer, or
  polling loop was added.

## Validation

- `cargo fmt --manifest-path .\musu-rs\Cargo.toml`
- `cargo test --manifest-path .\musu-rs\Cargo.toml room_presence --lib -- --test-threads=1`
  passed `4/4`.
- `cargo test --manifest-path .\musu-rs\Cargo.toml --bin musu room_presence_publish_cli_accepts_json_flag`
  passed `1/1`.
- `cargo check --manifest-path .\musu-rs\Cargo.toml --bin musu` passed.
- `cargo build --manifest-path .\musu-rs\Cargo.toml --bin musu` passed.
- `.\musu-rs\target\debug\musu.exe room presence --help` showed
  `publish` and `list`.
- `.\musu-rs\target\debug\musu.exe room presence publish --help` showed
  publish options.
- `.\musu-rs\target\debug\musu.exe room presence list --help` showed list
  filters.
- `git diff --check` passed.

## Release Note

This is Rust runtime source. The previously generated packaged MSIX, primary
smoke, desktop-open CPU, runtime CPU matrix, final packet, and operator action
pack were built from an older commit and are now stale for this source until
they are regenerated.

Public desktop release remains No-Go until the second Windows PC has the same
current build installed and returns runtime/multi-device evidence, hosted
`musu.pro` P2P control-plane proof passes, `musu@musu.pro` mailbox evidence is
recorded, and Store evidence is complete.
