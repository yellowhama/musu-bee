# 2026-05-29 09:44 KST - Store Reservation Timestamp Final Runner

## Decision

The final operator runner must record the real Partner Center product-name
reservation timestamp instead of allowing the Store recorder to infer it from
the later submission timestamp.

## Changes

- `scripts\windows\complete-final-operator-gates.ps1` now exposes
  `-StoreProductNameReservedAt`.
- Store evidence recording through the final runner now requires
  `-StoreProductNameReservedAt`.
- `scripts\windows\show-final-release-handoff-status.ps1` and
  `scripts\windows\prepare-final-operator-gate-packet.ps1` now show the
  reservation timestamp in the Store recorder command and the final completion
  command.
- `scripts\windows\verify-final-operator-gate-packet.ps1` now fails if the
  packet README's final command omits `-StoreProductNameReservedAt`.

## Reason

`record-store-release-verification.ps1` still supports a fallback for direct
manual use, but the official final release path should preserve a sharper audit
trail: product-name reservation first, then app submission, then Microsoft
certification/restricted capability approval. The official commands do not
expose the boolean reservation flag because `[bool]` script parameters are
awkward through `powershell.exe -File`; the recorder default and verifier enforce
`product_name_reserved=true`.

## Release State

This closes an automation/documentation weakness only. Public desktop release
remains blocked until real second-PC MSIX install evidence, real second-PC
multi-device evidence, `support@musu.pro` delivery evidence, and Microsoft Store
release evidence are recorded.
