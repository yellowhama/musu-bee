# Manual evidence fail-closed hardening

Date: 2026-05-29 11:15 KST

## Decision

Manual release evidence must not be accepted when the operator can accidentally
or post-hoc fill weak placeholders.

## Changes

- Support mailbox verification now validates the current release version,
  explicit `musu-...` verification token shape, sender email shape, sender not
  being `support@musu.pro`, delivery order, recording order, future timestamps,
  and evidence age.
- Support mailbox recording now requires `-VerificationId`; it no longer
  generates a token after the fact.
- The final completion runner requires `-SupportVerificationId` whenever
  support mailbox evidence is recorded.
- Store release recording now requires explicit `-ProductNameReservedAt`; it no
  longer falls back to using submission time as the product-name reservation
  time.
- Store release verification now checks published timestamp shape when present,
  recording order, future timestamps, and evidence age.
- Final packet verification now rejects packets whose bundled support/Store
  evidence scripts lack these guards.

## Verification

- PowerShell parser check passed for all edited Windows release scripts.
- Positive support and Store evidence smoke tests passed under `.local-build`
  hardening-only output roots.
- Negative support evidence with a bad token was rejected.
- Negative Store evidence with an empty product-name reservation timestamp was
  rejected.

## Release state

Public desktop release remains No-Go until real second-PC MSIX install evidence,
real second-PC multi-device evidence, real `support@musu.pro` delivery evidence,
and real Partner Center/Microsoft Store approval evidence are recorded.
