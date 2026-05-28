# CoS Memory Note - Store Metadata Basics (2026-05-29 05:25 KST)

Facts:

- Public site routes now exist for Microsoft Store metadata:
  - `musu-bee/src/app/privacy/page.tsx` -> `https://musu.pro/privacy`
  - `musu-bee/src/app/support/page.tsx` -> `https://musu.pro/support`
- `docs/STORE_SUBMISSION_METADATA_2026_05_29.md` records Partner Center metadata fields, conservative Store copy, support URL, privacy URL, and pre-submission checks.
- `scripts/windows/audit-desktop-release-readiness.ps1` now checks that the privacy route, support route, and Store metadata doc exist.
- Microsoft Store policy requires a privacy policy for Win32/Desktop Bridge products; Partner Center support info accepts a support URL or email.

Decision:

- Use `https://musu.pro/privacy` and `https://musu.pro/support` for Partner Center.
- Verify public deployment and `support@musu.pro` mailbox delivery before submission.
- Do not let Store metadata readiness override the real remaining release blocker: second-PC multi-device evidence is still missing.

Canonical docs:

- `docs/STORE_SUBMISSION_METADATA_2026_05_29.md`
- `docs/STORE_LAUNCH_AND_PROMOTION_PLAN_2026_05_29.md`
- `docs/DESKTOP_RELEASE_READINESS_AUDIT_2026_05_29.md`
