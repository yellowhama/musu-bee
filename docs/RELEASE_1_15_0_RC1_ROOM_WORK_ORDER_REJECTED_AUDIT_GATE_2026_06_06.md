# MUSU 1.15.0-rc.1 Room Work-Order Rejected Audit Gate

**Wiki ID**: wiki/817
**Date**: 2026-06-06

## Summary

Room work-order rejected-input audit logging is now locked by route regression
tests, the operator API security audit, and the release evidence verifier
source contract.

This is a hardening gate. It does not change the local execution model:
MUSU.PRO can accept authenticated room/work-order input, but MUSU Desktop and
the local bridge remain the executors. The web surface must leave a
privacy-preserving command audit trail even when authenticated input is rejected
before bridge forwarding.

## Change

Updated:

- `musu-bee/src/app/api/rooms/[roomId]/work-orders/route.test.ts`
  - added invalid-JSON regression coverage after P2P control auth
  - extended missing-instruction regression coverage to assert audit logging
  - asserts rejected inputs do not call the bridge
  - asserts rejected audit events omit `text` and `instruction`
- `scripts/windows/audit-operator-api-security-contract.ps1`
  - now gates rejected room work-order audit coverage
  - checks `invalid_json`, `instruction required`, no bridge forwarding, and
    prompt-body redaction assertions
- `scripts/windows/test-release-evidence-verifiers.ps1`
  - added source-contract case
    `operator API security gates rejected room work-order audit logging`

The runtime route already wrote these rejected audit events. This update makes
that behavior release-gated so it cannot silently regress.

## Validation

Passed:

- PowerShell parser check for the updated audit/verifier scripts
- `npm run test:routes`: `30/30`
- `npm run typecheck`
- `scripts/windows/audit-operator-api-security-contract.ps1 -FailOnProblem -Json`:
  `ok=true`, `fail_count=0`
- `scripts/windows/test-release-evidence-verifiers.ps1 -Json`:
  `ok=true`, `case_count=58`, `failed_case_count=0`
- `git diff --check`

## Qualitative Audit

No high or medium issue was found.

The important security behavior is now explicit:

- unauthenticated room work orders are rejected before bridge access
- authenticated but invalid JSON is rejected and audit-logged
- authenticated but missing-instruction work orders are rejected and
  audit-logged
- rejected work orders do not call the local bridge
- command audit JSONL records owner/room/status/reason metadata
- command audit JSONL does not store the user instruction text

This improves forensic coverage for MUSU.PRO remote input without turning the
website into the executor or turning command audit logs into a prompt/content
store.

## Product Spec Impact

The product boundary remains unchanged:

- MUSU.PRO is remote input, project/company room, presence, rendezvous,
  path-selection, relay-fallback, and evidence/control plane.
- MUSU Desktop and local bridge execute work locally.
- Room work orders are P2P-control-auth gated before they can reach the local
  bridge.
- Accepted, rejected, and bridge-error room work-order paths must leave
  privacy-preserving command audit metadata.

This moves the goal's `P2P command audit log` hardening from an implementation
detail to a release-gated contract.

## Release Status

This change does not close public release readiness. It strengthens the
operator API/P2P room input gate while the remaining public blockers stay:

- real second-PC multi-device route evidence
- second-PC idle CPU evidence
- second-PC runtime CPU scenario matrix evidence
- hosted MUSU.PRO P2P login/control-plane/relay proof
- support mailbox proof
- Store/Partner Center proof
