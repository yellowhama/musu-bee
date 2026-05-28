# Store / MSIX Next Steps — 2026-05-27

This document is the operational next-step queue for the Windows distribution pivot.

It is intentionally narrower than the packaging guide. The guide explains the system. This file says what to do next.

## Current state

- `local-sideload-manual` artifact: built and repo-local verified
- `store-reviewed-immediate-registration` artifact: built and repo-local verified
- submission bundle: prepared
- Partner Center account:
  - email verification: complete
  - business/employment enrollment approval: cleared by operator report on 2026-05-29

Important:

- The prepared artifact/bundle is from the 2026-05-27 packaging pass and uses `1.13.0.0`.
- The current beta target is `1.15.0-rc.1`.
- Treat the old bundle as a template until a current-version Store-reviewed package is regenerated.

## Canonical artifacts

- local manual artifact:
  - `.local-build/msix/output/musu_1.13.0.0_x64_local-sideload-manual.msix`
- Store-reviewed artifact:
  - `.local-build/msix/output/musu_1.13.0.0_x64_store-reviewed-immediate-registration.msix`
- submission bundle:
  - `.local-build/msix/submission-bundles/store-reviewed-20260527-121555`

## Immediate operator queue

### 1. Reserve the product name

Partner Center account approval is no longer the blocker. Create the app entry and reserve the product name first.

Candidate order:

1. `MUSU`
2. `MUSU Desktop`
3. `MUSU Local`
4. `MUSU Control`

Do not use unrelated internal product names in the MUSU Store listing.

## 2. Regenerate the Store-reviewed package for 1.15.0-rc.1

The existing submission bundle contains the older `1.13.0.0` artifact. Before submission:

- rebuild the Store-reviewed MSIX package for `1.15.0-rc.1`
- regenerate the submission bundle
- confirm restricted startup capability and `ImmediateRegistration=true`
- update this file with the new artifact and bundle path

Use:

- `partner-center-capability-justification.md` from the submission bundle
- `submission-notes.txt` from the submission bundle
- [STORE_MSIX_PARTNER_CENTER_HANDOFF_2026_05_27.md](F:/workspace/musu-bee/docs/STORE_MSIX_PARTNER_CENTER_HANDOFF_2026_05_27.md) once verification clears
- [STORE_LAUNCH_AND_PROMOTION_PLAN_2026_05_29.md](F:/workspace/musu-bee/docs/STORE_LAUNCH_AND_PROMOTION_PLAN_2026_05_29.md)

## 3. Submit the Store-reviewed artifact

Submission inputs:

- MSIX:
  - current-version Store-reviewed `.msix` after regeneration
- capability justification:
  - `partner-center-capability-justification.md`
- supporting notes:
  - `submission-notes.txt`
- signing certificate:
  - `Yellowhama.MUSU_cert.cer`

Critical claim boundary:

- do **not** describe the local sideload path as auto-start-ready
- do describe the Store-reviewed artifact as the reviewed auto-start variant

## 4. Record the Microsoft review outcome back into the repo

When Microsoft responds:

- update `docs/STORE_MSIX_APPROVAL_STATUS_2026_05_27.md`
- append the result to `docs/GOAL.md` revision history if it changes the Windows product contract
- if approved:
  - mark Store auto-start as externally cleared
- if rejected:
  - capture the exact rejection reason
  - create a remediation note before changing the packaging scripts

## 5. Post-approval engineering follow-ups

These are not blockers for submission, but they should be queued:

1. Decide whether Store builds keep `~/.musu` as the long-term runtime home.
2. Split `musu-rs/src/install/cli_commands.rs` by command domain.
3. Move remaining MSIX helper duplication out of `build-msix.ps1`.
4. Review policy sensitivity of:
   - PTY shell
   - remote exec / RPC
   - WebDAV
   - file write/delete
   - mDNS advertising
   - clipboard monitor
   - peer/cloud registration

## Proof commands

Contract audit:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\audit-msix-startup-contracts.ps1
```

Local/manual installed verification:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\install-and-verify-msix.ps1 `
  -StartupContract local-sideload-manual
```

Store-reviewed artifact verification:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\verify-msix-package.ps1 `
  -StartupContract store-reviewed-immediate-registration `
  -SkipSmoke
```
