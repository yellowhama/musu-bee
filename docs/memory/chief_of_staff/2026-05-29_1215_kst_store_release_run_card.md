# CoS Memory Note - Store Release Run Card (2026-05-29 12:15 KST)

## Facts

- Added `docs/MICROSOFT_STORE_RELEASE_RUN_CARD_2026_05_29.md`.
- The run card is MUSU-specific and intentionally ignores other-product copy such as HiveLink/Vibe PM.
- Current Store product boundary: MUSU desktop, not `musu-system` ecosystem tools.
- Current release path remains MSIX first; Tauri MSI/NSIS stays fallback/diagnostic, not first Store path.
- Public release remains blocked until all four external evidence gates are recorded:
  1. clean/current second-PC MSIX install evidence
  2. real second-PC multi-device routing evidence
  3. real `support@musu.pro` inbox delivery evidence
  4. Partner Center product-name reservation, app submission, Microsoft certification, and restricted capability approval evidence

## Source refresh

- Microsoft Learn source refresh confirms Store-submitted MSIX packages are re-signed by Microsoft after certification.
- MSI/EXE fallback still requires publisher signing and immutable versioned package URLs.
- Restricted capabilities require submission explanation/approval before Store publication.

## Decision

- Do not claim public desktop readiness until `write-release-go-no-go.ps1 -FailOnNotReady -Json` reports `ready_for_public_desktop_release=true`.
- Do not bundle `musu-system`, `musu-crawl-ai`, `musu-marketer`, or `musu-nurikun` into the first Store package.
