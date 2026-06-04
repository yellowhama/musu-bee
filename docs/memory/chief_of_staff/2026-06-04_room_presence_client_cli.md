# 2026-06-04 Room Presence Client CLI

- Added local Rust CLI commands `musu room presence publish <room-id>` and
  `musu room presence list <room-id>`.
- This lets each installed local MUSU program publish/query its current
  owner-scoped `musu.pro` project/company room presence instead of relying only
  on server-side APIs.
- `publish` builds a local route candidate from the bridge URL or
  `--public-url`, classifies LAN/Tailscale/direct-QUIC, includes endpoint
  scheme, capability, optional active work orders, optional relay capability,
  origin `musu.local-program`, and local TLS fingerprint public key when
  available.
- Product boundary remains locked: `musu.pro` is remote input, project room,
  company meeting room, presence, rendezvous, path-selection, relay-fallback
  coordination, and evidence; local MUSU programs execute work and prefer P2P
  mesh after web-assisted rendezvous.
- No background heartbeat, timer, or polling loop was added; this is on-demand
  CLI only.
- Validation passed: `cargo fmt`, targeted Rust room presence lib tests `4/4`,
  parser test `1/1`, `cargo check --bin musu`, debug binary build, room
  presence help checks, and `git diff --check`.
- This is Rust runtime source, so current packaged primary evidence/final
  packet/action pack are stale until MSIX/smoke/CPU/matrix evidence and packs
  are regenerated from this commit.
