# Store / MSIX Partner Center Handoff — 2026-05-27

This handoff is for the next operator or agent who resumes the Windows Store path **after Partner Center verification clears**.

It assumes the repo-local packaging work is already complete and the next bottleneck is Partner Center submission plus Microsoft review.

## 2026-05-29 update

Operator reported that Partner Center enrollment approval cleared.

Use this handoff now, but with one correction:

- the listed submission bundle is the 2026-05-27 `1.13.0.0` packet
- current release target is `1.15.0-rc.1`
- regenerate the Store-reviewed artifact and submission bundle before uploading

See:

- [STORE_LAUNCH_AND_PROMOTION_PLAN_2026_05_29.md](F:/workspace/musu-bee/docs/STORE_LAUNCH_AND_PROMOTION_PLAN_2026_05_29.md)
- [STORE_SUBMISSION_METADATA_2026_05_29.md](F:/workspace/musu-bee/docs/STORE_SUBMISSION_METADATA_2026_05_29.md)

## Resume condition

Use this handoff when **both** of these are true:

- Partner Center business verification is no longer `Under review`
- Partner Center employment verification is no longer `Under review`

If either one is still pending, stop here and use [STORE_MSIX_NEXT_STEPS_2026_05_27.md](F:/workspace/musu-bee/docs/STORE_MSIX_NEXT_STEPS_2026_05_27.md) instead.

## What is already done

- local/manual packaged contract is verified
- Store-reviewed artifact exists
- Store-reviewed verification log exists
- restricted-capability justification draft exists
- submission bundle exists

Canonical bundle:

- [store-reviewed-20260527-121555](F:/workspace/musu-bee/.local-build/msix/submission-bundles/store-reviewed-20260527-121555)

Important files inside the bundle:

- [musu_1.13.0.0_x64_store-reviewed-immediate-registration.msix](F:/workspace/musu-bee/.local-build/msix/submission-bundles/store-reviewed-20260527-121555/musu_1.13.0.0_x64_store-reviewed-immediate-registration.msix)
- [partner-center-capability-justification.md](F:/workspace/musu-bee/.local-build/msix/submission-bundles/store-reviewed-20260527-121555/partner-center-capability-justification.md)
- [submission-notes.txt](F:/workspace/musu-bee/.local-build/msix/submission-bundles/store-reviewed-20260527-121555/submission-notes.txt)
- [verify-store-reviewed.txt](F:/workspace/musu-bee/.local-build/msix/submission-bundles/store-reviewed-20260527-121555/verify-store-reviewed.txt)
- [Yellowhama.MUSU_cert.cer](F:/workspace/musu-bee/.local-build/msix/submission-bundles/store-reviewed-20260527-121555/Yellowhama.MUSU_cert.cer)

## Product truth you must preserve

Do not blur these contracts:

1. `direct-download bootstrap`
2. `local-sideload-manual`
3. `store-reviewed-immediate-registration`

Critical rule:

- **Do not** describe local sideload as auto-start-ready
- **Do** describe the Store-reviewed artifact as the restricted-capability auto-start variant

Canonical contract docs:

- [WINDOWS_DISTRIBUTION_PIVOT_2026-05-27.md](F:/workspace/musu-bee/docs/PRODUCT_CHARTER/WINDOWS_DISTRIBUTION_PIVOT_2026-05-27.md)
- [STORE_MSIX_APPROVAL_STATUS_2026_05_27.md](F:/workspace/musu-bee/docs/STORE_MSIX_APPROVAL_STATUS_2026_05_27.md)

## First actions after verification clears

### 1. Regenerate current-version artifact if the release version changed

The 2026-05-27 bundle points at `musu_1.13.0.0_x64_store-reviewed-immediate-registration.msix`.

If the current release target is still `1.15.0-rc.1`, regenerate before upload:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\prepare-store-submission-bundle.ps1
```

Then update this handoff and the approval ledger with the new bundle path.

### 2. Re-verify the artifact before uploading

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\verify-msix-package.ps1 `
  -StartupContract store-reviewed-immediate-registration `
  -SkipSmoke
```

Expected:

- `StartupImmediateRegistration = true`
- `HasRestrictedStartupCapability = True`

### 3. Confirm the latest bundle is still the intended submission packet

Check:

- bundle path still exists
- artifact name still matches current version
- justification and notes still describe the current product truth

If artifact version changed since this handoff:

- rebuild the Store-reviewed artifact
- regenerate the submission bundle
- update this handoff and the approval status ledger before submitting

### 4. Create or open the Partner Center app entry

Partner Center flow:

1. Sign in
2. `Apps & games`
3. `New product`
4. choose the Windows MSIX/PWA product path
5. reserve the MUSU name if not already reserved
6. enter `https://musu.pro/privacy` as the privacy policy URL
7. enter `https://musu.pro/support` as the support URL

### 5. Submit the Store-reviewed artifact

Upload:

- the Store-reviewed `.msix`

Copy into the Partner Center form:

- capability justification from `partner-center-capability-justification.md`
- any extra reviewer notes from `submission-notes.txt`
- privacy URL: `https://musu.pro/privacy`
- support URL: `https://musu.pro/support`

## Decision tree after submission

### If Microsoft approves

1. Update [STORE_MSIX_APPROVAL_STATUS_2026_05_27.md](F:/workspace/musu-bee/docs/STORE_MSIX_APPROVAL_STATUS_2026_05_27.md)
   - mark the Store-reviewed path externally cleared
2. Record machine-readable approval evidence:
   `scripts\windows\record-store-release-verification.ps1`
3. Update [STORE_MSIX_NEXT_STEPS_2026_05_27.md](F:/workspace/musu-bee/docs/STORE_MSIX_NEXT_STEPS_2026_05_27.md)
   - replace verification/submission queue with publication/post-approval tasks
4. Append a revision line to [GOAL.md](F:/workspace/musu-bee/docs/GOAL.md) if the Windows product contract changed from blocked to cleared
5. Add a short result memo under `docs/memory/chief_of_staff/`
6. Queue post-approval engineering work:
   - runtime-home decision (`~/.musu` vs package-aware app data)
   - `cli_commands.rs` split
   - Store-policy-sensitive surface review

### If Microsoft rejects

1. Capture the exact rejection reason verbatim in a new doc:
   - `docs/STORE_MSIX_REVIEW_REJECTION_<date>.md`
2. Update [STORE_MSIX_APPROVAL_STATUS_2026_05_27.md](F:/workspace/musu-bee/docs/STORE_MSIX_APPROVAL_STATUS_2026_05_27.md)
3. Do **not** silently mutate the packaging scripts first
4. First classify the rejection:
   - account/verification issue
   - restricted capability justification issue
   - technical manifest/package issue
   - broader Store policy issue against the machine-control surface
5. Only after classification, open a remediation plan doc

## Canonical commands

Artifact audit:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\audit-msix-startup-contracts.ps1
```

Store-reviewed verify:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\verify-msix-package.ps1 `
  -StartupContract store-reviewed-immediate-registration `
  -SkipSmoke
```

Bundle regeneration if needed:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\prepare-store-submission-bundle.ps1
```

## Handoff verdict

Repo-local Windows packaged work is in the right state for a handoff:

- local/manual contract: complete
- Store-reviewed artifact: ready
- submission packet: ready
- remaining blocker: Partner Center + Microsoft review

This handoff exists so the next session does not have to rediscover the contract split or reassemble the submission packet from scratch.
