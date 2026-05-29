# 2026-05-29 13:31 KST - Support Email Correction

The release support mailbox is `musu@musu.pro`, not `support@musu.pro`.

- Added root `SUPPORT_EMAIL` as the release support mailbox source of truth.
- Added `scripts/windows/release-config.ps1`; release gate scripts now read the support mailbox from `SUPPORT_EMAIL` unless an operator explicitly overrides the parameter.
- Added `musu-bee/src/lib/contact.ts`; public `/support`, `/privacy`, and Store metadata E2E tests now share the app contact constant.
- Replaced the old hardcoded support mailbox across current release docs, handoff docs, Store metadata, and Chief of Staff memory notes.
- Final operator packets must include `SUPPORT_EMAIL` and `release-config.ps1`; packet verification checks metadata, README, and support template against the configured support mailbox.

Current public release blocker remains real inbox delivery evidence for `musu@musu.pro`.
