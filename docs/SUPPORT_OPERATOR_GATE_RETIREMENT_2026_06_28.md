# MUSU Support Operator Gate Retirement (2026-06-28)

## Decision

Retire the historical `musu@musu.pro` external mailbox delivery proof as a
mandatory full-product release blocker.

This retirement is narrow. It does not retire support availability, the support
email address, the public support route, the privacy route, or public release
metadata. It only retires the requirement that each release must prove an
external email round trip into the support inbox.

## Replacement Controls

The support/operator lane is satisfied when a current
`musu.support_operator_gate_retirement.v1` evidence file verifies all of these:

- `https://musu.pro/support` is live and includes the configured support email.
- `https://musu.pro/privacy` is live and includes the configured support email.
- `https://musu.pro/api/public-config` returns the configured support URL,
  privacy URL, support email, and current release metadata.
- The evidence explicitly keeps support availability active and only retires the
  historical mailbox delivery proof.

## Rationale

The old mailbox proof tested one operator action: a real message reached
`musu@musu.pro`. It did not test the product runtime, install channel, Store
submission, relay transport, V34 self-heal behavior, or user-visible support
entry points.

For the desktop product spec, the stronger release invariant is that the public
support contract is deployed, current-versioned, and machine-verified. Mailbox
delivery can still be checked operationally, but it should not block the product
completion claim when the public support contract is live and verified.

## Proof

Authoritative tooling:

- `scripts/windows/record-support-operator-gate-retirement.ps1`
- `scripts/windows/verify-support-operator-gate-retirement.ps1`
- `scripts/windows/verify-store-public-metadata.ps1`

Accepted evidence path:

- `docs/evidence/support-operator-gate-retirement/<VERSION>/*.support-operator-gate-retirement.json`
