# MUSU 1.15.0-rc.1 Secret Storage Contract Hardening

**Wiki ID**: wiki/707
**Date**: 2026-06-04 23:04 KST

## Decision

The local-program/web-input roadmap needs a first-class secret storage gate.

`musu.pro` can collect remote user input, coordinate company/project rooms,
exchange presence and route candidates, and help local MUSU programs rendezvous
before they prefer P2P mesh. That makes token handling part of the release
boundary: the hosted web plane must not expose raw secrets, and local programs
must keep bridge/account/P2P credentials out of ordinary diagnostics, backups,
and support bundles.

## Change

`musu-rs\src\cloud\token.rs` now restricts saved account-token files on
Windows with `icacls` after writing `~\.musu\token`. Unix behavior remains
`0600`. Windows ACL helpers now prefer a domain-qualified
`USERDOMAIN\USERNAME` principal when available.

`docs\PRODUCTION.md` now keeps routine config backup non-secret:

- `~/.musu/nodes.toml` is backed up as ordinary config
- `~/.musu/bridge.env`, `~/.musu/bridge_token`, and `~/.musu/token` are
  explicitly excluded from ordinary config backups
- token backup, if required, must use an encrypted secret store or encrypted
  archive

Added `scripts\windows\audit-secret-storage-contract.ps1` with schema
`musu.secret_storage_contract.v1`. The audit checks:

- bridge-token generation uses CSPRNG, `0600`, Windows ACL restriction with a
  domain-qualified principal when available, and a no-commit/no-share warning
- runner bridge-token creation applies Unix permissions and Windows ACL
  restriction
- cloud account-token storage applies Unix permissions and Windows ACL
  restriction
- dashboard bridge-token loading stays server-only and reads only env or
  `~/.musu/bridge.env`
- P2P token-hash helper does not print raw account tokens
- hosted P2P env helper sends secret values through secret/variable commands
  without echoing them
- CPU/runtime evidence redacts token-like command lines
- production/docs config backups do not include token-bearing files

The release gate surface now includes:

- `secret_storage_contract_verified`
- `secret_storage_contract_audit`
- blocker area `secret-storage`
- final handoff command `audit_secret_storage_contract`
- final operator packet inclusion and verification for the new audit script

## Validation

- PowerShell parser checks passed for:
  - `audit-secret-storage-contract.ps1`
  - `write-release-go-no-go.ps1`
  - `show-final-release-handoff-status.ps1`
  - `prepare-final-operator-gate-packet.ps1`
  - `verify-final-operator-gate-packet.ps1`
  - `audit-desktop-release-readiness.ps1`
- `audit-secret-storage-contract.ps1 -FailOnProblem -Json`:
  `ok=true`, `fail_count=0`
- Rust targeted unit test passed:
  `cargo test --manifest-path .\musu-rs\Cargo.toml --lib cloud::token::tests::save_load_delete_token_round_trips -j 1`
- `cargo fmt --manifest-path .\musu-rs\Cargo.toml --check` passed
- `git diff --check` passed with only the existing CRLF normalization warning
  for `docs/PRODUCTION.md`
- Dirty-tree go/no-go reported `secret_storage_contract_verified=true`

## Release Interpretation

This changes Rust runtime source and final release gate scripts, so packaged
MSIX/smoke/CPU/matrix evidence and operator packets must be regenerated after
commit before this source can be treated as current.

Public desktop release remains No-Go until real second-PC multi-device evidence,
two-machine CPU/matrix evidence, hosted `musu.pro` P2P control-plane/relay
proof, support mailbox delivery evidence, and Store evidence are complete.
