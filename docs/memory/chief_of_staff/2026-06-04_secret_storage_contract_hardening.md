# 2026-06-04 Secret Storage Contract Hardening

- Roadmap boundary remains: `musu.pro` is the remote input, room, presence,
  rendezvous, path-selection, fallback-relay coordination, and evidence plane;
  local MUSU programs execute work and prefer P2P mesh after web-assisted
  rendezvous.
- Added a dedicated secret storage release gate with schema
  `musu.secret_storage_contract.v1`.
- The gate verifies local bridge/account token file permissions, Windows ACL
  restriction, raw-token redaction helpers, hosted P2P secret setup behavior,
  runtime evidence command redaction, and production backup docs.
- `musu-rs\src\cloud\token.rs` now restricts account token files on Windows
  with `icacls` after writing `~\.musu\token`; Unix remains `0600`. Windows
  ACL helpers now prefer a domain-qualified `USERDOMAIN\USERNAME` principal
  when available.
- `docs\PRODUCTION.md` now backs up only non-secret config by default and warns
  against placing `bridge.env`, `bridge_token`, or `token` in ordinary backups.
- Validation passed targeted Rust token test, secret-storage audit, parser
  checks, `cargo fmt --check`, and `git diff --check` with the existing
  `docs/PRODUCTION.md` CRLF normalization warning.
- This is runtime source plus release-gate hardening, so packaged primary
  evidence and final operator packets are stale until regenerated from the
  resulting commit.
