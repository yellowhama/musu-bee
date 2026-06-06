# MUSU 1.15.0-rc.1 Support Mailbox Request Packet

**Date**: 2026-06-07 04:06 KST
**Wiki ID**: wiki/919
**Machine**: `HUGH_SECOND`

## Summary

Support mailbox verification now has a support-only request packet generator.

The support gate still requires a real delivered email in the `musu@musu.pro`
inbox. The new packet only prepares the outbound email template, verification
token, record command, checksums, and zip under `.local-build`; it does not
write release evidence and does not satisfy go/no-go.

## Changed

Added `scripts\windows\prepare-support-mailbox-verification-request.ps1`:

- emits `musu.support_mailbox_verification_request.v1`
- writes under `.local-build\support-mailbox-requests` by default
- generates `SUPPORT_MAILBOX_VERIFICATION_EMAIL.txt`
- generates `README_SUPPORT_MAILBOX_VERIFICATION_REQUEST.md`
- generates `support-mailbox-verification-request.json`
- generates `SHA256SUMS.txt`, a timestamped zip, and a latest zip
- records `git_dirty` in the request result instead of requiring a clean tree
- emits `release_gate_satisfied=false`
- prints the `record-support-mailbox-verification.ps1` command to run after
  real inbox delivery is confirmed

Updated final operator packet tooling:

- `prepare-final-operator-gate-packet.ps1` now includes the support request
  generator in packet script copies
- the final packet README explains that the support-only request packet does
  not satisfy release evidence
- `verify-final-operator-gate-packet.ps1` checks that boundary

Updated release verifier regression:

- added `support mailbox request packet is not release evidence`
- added placeholder sender rejection coverage so `<sender@example.com>` cannot
  be recorded as support proof
- added support-mailbox freshness status-only coverage so changes to support
  request/record/verify/operator-card tooling do not stale unrelated local
  desktop evidence

## Smoke Result

Command:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\prepare-support-mailbox-verification-request.ps1 -OutputRoot .local-build\support-mailbox-request-smoke -VerificationId musu-support-smoke-20260607-fedcba0987654321 -Json
```

Result:

- `schema=musu.support_mailbox_verification_request.v1`
- `ok=true`
- `support_email=musu@musu.pro`
- `verification_id=musu-support-smoke-20260607-fedcba0987654321`
- record command uses `REPLACE_WITH_EXTERNAL_SENDER_EMAIL`
- `release_gate_satisfied=false`
- `git_dirty=true` because this was a post-edit smoke
- output root:
  `.local-build\support-mailbox-request-smoke\musu-support-mailbox-request-1.15.0-rc.1-20260607-041129`
- latest zip:
  `.local-build\support-mailbox-request-smoke\musu-support-mailbox-request-1.15.0-rc.1-latest.zip`

No file was written under `docs\evidence\support-mailbox`.

## Validation

- PowerShell parser checks passed for touched scripts.
- Support request smoke passed.
- Release evidence verifier regression passed with `ok=true`,
  `case_count=102`, and `failed_case_count=0`.
- Dirty-tree go/no-go smoke after the freshness fix correctly restored local
  evidence recognition: `single_machine_verified=true`, runtime idle count `1`,
  runtime matrix count `1`, process/startup/desktop single-instance true, and
  temporary `git` blocker only because the fix was not committed yet.

## Qualitative Audit

Code audit found one issue before finalizing: the initial placeholder sender
string was email-shaped enough to risk passing the support evidence verifier if
copied literally. The verifier now rejects placeholder sender addresses, and
the handoff templates use `REPLACE_WITH_EXTERNAL_SENDER_EMAIL` instead of
`<sender@example.com>`.

No remaining high or medium issue was found in this scoped change.

The two main risks were false evidence creation and false stale-evidence
regression. The implementation avoids false evidence by using a separate
request schema, keeping output in ignored `.local-build`, and requiring
`record-support-mailbox-verification.ps1` after real delivery before go/no-go
can report `support_mailbox_verified=true`. The freshness classifiers now also
treat support mailbox operator/evidence tooling as status-only, so preparing or
hardening the support request path does not invalidate unrelated one-machine
desktop proof.

Public release remains No-Go on support mailbox proof until actual inbox
delivery is recorded. It also remains No-Go on second-PC route/CPU/matrix,
hosted MUSU.PRO P2P/relay proof, and Store/Partner Center proof.
