# CoS Memory Note — Windows Distribution Split (2026-05-27 22:30 KST)

Facts:

- Windows packaged delivery is now a three-contract story:
  1. direct-download bootstrap
  2. local sideload / manual bridge
  3. Store-reviewed restricted-capability auto-start
- local sideload is no longer treated as a failed auto-start attempt; it is an intentional manual-bridge contract.
- Store-reviewed auto-start is repo-local prepared but externally blocked on Partner Center verification and Microsoft review.
- The current canonical submission bundle is:
  `F:\workspace\musu-bee\.local-build\msix\submission-bundles\store-reviewed-20260527-121555`

Canonical next-step order:

1. Partner Center business verification clears.
2. Partner Center employment verification clears.
3. Reserve product name / create app listing.
4. Submit `store-reviewed-immediate-registration` artifact with the prepared justification packet.
5. Record Microsoft approval or rejection back into repo docs before changing packaging code.

Do not forget:

- local/manual package success does **not** prove Store auto-start approval
- the product claim boundary must stay:
  - local sideload/manual = complete
  - Store-reviewed auto-start = pending external approval
