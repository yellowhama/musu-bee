# 2026-06-05 Room Presence Candidate Metadata Client CLI

## DEBUG REPORT

- Symptom: The web control plane preserved public/NAT/relay candidate metadata,
  but the local Rust CLI still emitted only `kind`, `addr`, `observed_at`, and
  `scheme` for room presence candidates.
- Root cause: `CandidateEndpoint` in `musu-rs/src/cloud/mod.rs` lacked the
  metadata fields, and `musu room presence publish` could only publish one
  local/public URL candidate.
- Fix: Added Rust `NatType` and `RelayProtocol` DTOs, extended
  `CandidateEndpoint`, and expanded `musu room presence publish` with repeated
  `--candidate-url`, `--nat-type`, `--nat-observed-by`, `--relay-url`, and
  `--relay-protocol`. JSON output now includes backward-compatible `candidate`
  and full `candidates`.
- Evidence: `cargo check --manifest-path .\musu-rs\Cargo.toml --bin musu`
  passed, Rust room-presence tests passed `6/6`, Rust rendezvous tests passed
  `5/5`, `npm run test:p2p` passed `79/79`, `npm run typecheck` passed,
  `audit-p2p-store-forward-relay-contract.ps1 -Json` passed with `ok=true` and
  `fail_count=0`, and `git diff --check` passed.
- Product boundary: Local MUSU programs still execute work. `musu.pro` is the
  remote input, project room, presence, rendezvous, path-selection,
  relay-fallback, and evidence surface.
- Status: DONE_WITH_CONCERNS because the source/contract is verified, but fresh
  packaged MSIX/smoke/CPU/matrix evidence is required after this Rust source
  change, and public release still needs second-PC, hosted P2P release proof,
  support mailbox, and Store evidence.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_ROOM_PRESENCE_CANDIDATE_METADATA_CLIENT_CLI_2026_06_05.md`
