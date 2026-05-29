# Store Product Name Evidence Gate - 2026-05-29 09:30 KST

Durable update:

- Store release evidence now records Partner Center product-name reservation explicitly.
- `scripts\windows\record-store-release-verification.ps1` writes:
  - `product_name_reserved`
  - `product_name_reserved_at`
- `scripts\windows\verify-store-release-evidence.ps1` requires the product-name reservation flag and timestamp before `store_release_verified=true`.
- Final handoff docs/status now describe the Store release gate as:
  1. Partner Center product name reservation
  2. Partner Center app submission
  3. Microsoft app certification
  4. restricted startup capability approval

Reason:

- Product name reservation was already listed as a manual external gate, but the release evidence schema only recorded later submission/certification facts.
- Keeping the reservation as a structured field avoids a final audit gap where the product identity step is only implied by a submission id.

Current release state remains No-Go until real external evidence is recorded for MSIX install, multi-device, support mailbox, and Store release approval.
