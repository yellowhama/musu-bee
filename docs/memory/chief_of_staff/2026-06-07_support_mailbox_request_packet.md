# 2026-06-07 support mailbox request packet

## Decision

Support mailbox release proof needs a request packet, but the request packet
must not be release evidence.

## Change

- Added `prepare-support-mailbox-verification-request.ps1`.
- The script writes request output under `.local-build\support-mailbox-requests`.
- Request schema is `musu.support_mailbox_verification_request.v1`.
- Request output includes an email template, README, checksums, zip, latest zip,
  verification token, and record command.
- The result explicitly reports `release_gate_satisfied=false`.
- Final operator packet tooling now carries the script and verifies the
  support-only request boundary.
- Support evidence verifier now rejects placeholder sender addresses.
- Release verifier adds
  `support mailbox request packet is not release evidence`.
- Freshness classifiers now treat support mailbox request/record/verify and
  operator-card tooling as status-only.

## Evidence

Smoke with `musu-support-smoke-20260607-fedcba0987654321` passed:

- `ok=true`
- `support_email=musu@musu.pro`
- `release_gate_satisfied=false`
- record command uses `REPLACE_WITH_EXTERNAL_SENDER_EMAIL`
- output stayed under `.local-build`

Validation passed with release verifier `case_count=102`,
`failed_case_count=0`.

Dirty-tree go/no-go after the freshness fix restored
`single_machine_verified=true`, runtime idle count `1`, runtime matrix count
`1`, and process/startup/desktop single-instance true; only the temporary `git`
blocker remained because the fix was not committed yet.

## Product Boundary

This does not change the MUSU Desktop/MUSU.PRO split. MUSU Desktop remains the
local executor. MUSU.PRO remains remote input, project/company room,
rendezvous, path selection, relay fallback coordination, and evidence/control
plane. Support request packets only prepare external operator action.
