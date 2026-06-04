# MUSU 1.15.0-rc.1 Hardening Gate Surface Alignment

**Wiki ID**: wiki/706
**Date**: 2026-06-04 22:40 KST

## Decision

The local-program/web-input roadmap now has matching release-gate visibility.

`musu.pro` is the remote input, project room, company meeting room, presence,
rendezvous, path-selection, fallback-relay coordination, and evidence plane.
Local MUSU programs still do the work. Because the web plane can submit work
orders and coordinate local executors, final release status must show the
security/resource hardening gates directly instead of hiding them inside
operator notes.

## Change

`scripts\windows\write-release-go-no-go.ps1` now executes and blocks on:

- `audit-local-api-auth-contract.ps1`
- `audit-operator-api-security-contract.ps1`

New go/no-go fields:

- `local_api_auth_contract_verified`
- `local_api_auth_contract_audit`
- `operator_api_security_contract_verified`
- `operator_api_security_contract_audit`

New blocker areas if these fail:

- `local-api-auth`
- `operator-api-security`

`scripts\windows\show-final-release-handoff-status.ps1` now prints the full
hardening surface:

- `frontend_polling_contract_verified`
- `rust_background_loop_contract_verified`
- `local_api_auth_contract_verified`
- `operator_api_security_contract_verified`
- process ownership, startup single-instance, and desktop single-instance

The final operator packet now carries and verifies
`audit-operator-api-security-contract.ps1`, and its README includes the
operator API security gate.

## Validation

- PowerShell parser check passed for:
  - `write-release-go-no-go.ps1`
  - `show-final-release-handoff-status.ps1`
  - `prepare-final-operator-gate-packet.ps1`
  - `verify-final-operator-gate-packet.ps1`
- `audit-local-api-auth-contract.ps1 -FailOnProblem -Json`:
  `ok=true`, `fail_count=0`, `stale_doc_hit_count=0`
- `audit-operator-api-security-contract.ps1 -FailOnProblem -Json`:
  `ok=true`, `fail_count=0`
- Dirty-tree go/no-go reported:
  `frontend_polling_contract_verified=true`,
  `rust_background_loop_contract_verified=true`,
  `local_api_auth_contract_verified=true`,
  `operator_api_security_contract_verified=true`,
  `process_ownership_verified=true`,
  `startup_single_instance_verified=true`, and
  `desktop_single_instance_verified=true`
- Dirty-tree handoff status reported the same four hardening gates under
  `gates.*`.
- `git diff --check` passed.

## Release Interpretation

This is release/status/packet hardening only. It does not change runtime source
and does not require fresh packaged MSIX/smoke/CPU/matrix evidence.

Public desktop release remains No-Go until real second-PC multi-device
evidence, two-machine CPU/matrix evidence, hosted `musu.pro` P2P
control-plane/relay proof, support mailbox delivery evidence, and Store
evidence are complete.
