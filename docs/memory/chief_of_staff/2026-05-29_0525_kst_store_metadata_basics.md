# CoS Memory Note - Store Metadata Basics (2026-05-29 05:25 KST)

Facts:

- Public site routes now exist for Microsoft Store metadata:
  - `musu-bee/src/app/privacy/page.tsx` -> `https://musu.pro/privacy`
  - `musu-bee/src/app/support/page.tsx` -> `https://musu.pro/support`
- `docs/STORE_SUBMISSION_METADATA_2026_05_29.md` records Partner Center metadata fields, conservative Store copy, support URL, privacy URL, and pre-submission checks.
- `scripts/windows/audit-desktop-release-readiness.ps1` now checks that the privacy route, support route, and Store metadata doc exist.
- `scripts/windows/verify-store-public-metadata.ps1` verifies deployed or local `/privacy` and `/support` pages return HTTP 200 and expected content.
- Local production verification passed against `http://127.0.0.1:3015` after `npm run build` and `npx next start -p 3015`.
- `scripts/windows/write-release-go-no-go.ps1` aggregates readiness audit, release manifest, public metadata verification, support mailbox status, and external Partner Center gates.
- Live `https://musu.pro/privacy` and `https://musu.pro/support` returned HTTP 200 but did not yet contain the expected new content; public deployment is still required.
- Microsoft Store policy requires a privacy policy for Win32/Desktop Bridge products; Partner Center support info accepts a support URL or email.

Decision:

- Use `https://musu.pro/privacy` and `https://musu.pro/support` for Partner Center.
- Verify public deployment and `musu@musu.pro` mailbox delivery before submission.
- Do not let Store metadata readiness override the real remaining release blocker: second-PC multi-device evidence is still missing.

Canonical docs:

- `docs/STORE_SUBMISSION_METADATA_2026_05_29.md`
- `docs/STORE_LAUNCH_AND_PROMOTION_PLAN_2026_05_29.md`
- `docs/DESKTOP_RELEASE_READINESS_AUDIT_2026_05_29.md`
