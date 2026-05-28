# Store / MSIX Approval Status — 2026-05-27

This document is the explicit status ledger for the Windows packaged split.

It exists to answer one question without ambiguity:

> What is finished inside the repo, and what still depends on Microsoft review?

## Requirement audit

### 1. Store path uses restricted capability approval for ImmediateRegistration

**Repo-local status:** prepared, not externally approved yet.

Evidence:

- Store-reviewed artifact exists:
  - `musu_1.13.0.0_x64_store-reviewed-immediate-registration.msix`
- Artifact verification succeeds:
  - `StartupImmediateRegistration = true`
  - `HasRestrictedStartupCapability = True`
- Submission bundle exists:
  - `.local-build/msix/submission-bundles/store-reviewed-20260527-121555`
- Bundle includes:
  - `.msix`
  - signing `.cer`
  - verification log
  - Partner Center justification draft
  - restricted capability checklist

What is still missing:

- Partner Center app listing / submission
- Submission options entry for restricted capability justification
- Microsoft certification result
- Microsoft approval / rejection outcome for the restricted startup capability

Conclusion:

- **Not complete yet**
- Remaining work is **external Microsoft review**

### 2. Local sideload excludes auto-start and uses manual `musu bridge`

**Repo-local status:** complete.

Evidence:

- Separate artifact exists:
  - `musu_1.13.0.0_x64_local-sideload-manual.msix`
- Artifact verification succeeds:
  - `StartupImmediateRegistration` is blank
  - `HasRestrictedStartupCapability = False`
- Installed-package verification succeeds under `local-sideload-manual`
- Local verification explicitly ends with:
  - `Automatic startup is not a success criterion for this package.`
  - manual command:
    `& "C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe" bridge`

Conclusion:

- **Complete**

### 3. Windows auto-start is split into a different deployment model

**Repo-local status:** complete.

Evidence:

- Two explicit startup contracts exist in packaging scripts and docs:
  - `local-sideload-manual`
  - `store-reviewed-immediate-registration`
- Distinct artifacts are emitted with contract-specific names.
- Distinct verification logic exists for each contract.
- Distinct docs and submission materials exist.

Conclusion:

- **Complete**

## Current verdict

As of **2026-05-27**:

- Partner Center company verification is still under review.
- Employment verification is still under review.
- Therefore the Store-reviewed path is still externally blocked even though the repo-local artifact and submission bundle are ready.

### Completed inside the repo

- contract split
- contract-specific artifacts
- local/manual install + verification path
- Store-reviewed artifact shape
- Store-reviewed submission bundle and justification packet

### Not completed inside the repo

- Microsoft approval itself
- Partner Center company verification completion
- Partner Center employment verification completion

That missing item is not a code gap. It is an external certification outcome.

## Status update — 2026-05-29

Operator reported that Microsoft Partner Center enrollment approval cleared.

Updated interpretation:

- Partner Center account-verification blocker: **cleared by operator report**
- Partner Center product/app entry: **not yet created/reserved in repo evidence**
- Store-reviewed app package submission: **not yet submitted**
- Microsoft app certification: **not yet complete**
- restricted startup capability approval: **not yet complete**
- Store release approval evidence: **not yet recorded**; use `scripts\windows\record-store-release-verification.ps1` after Microsoft approval.

Important correction:

- The 2026-05-27 Store-reviewed bundle remains valid as a proof/template packet.
- It should not be submitted as the current release candidate without regeneration, because it contains `musu_1.13.0.0_x64_store-reviewed-immediate-registration.msix`.
- Current release target is `1.15.0-rc.1`.

New immediate blocker:

- reserve the product name and regenerate the Store-reviewed artifact for the current version.

Reference:

- `docs/STORE_LAUNCH_AND_PROMOTION_PLAN_2026_05_29.md`

## Canonical proof commands

Local/manual artifact proof:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\verify-msix-package.ps1 `
  -StartupContract local-sideload-manual `
  -SkipSmoke
```

Store-reviewed artifact proof:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\verify-msix-package.ps1 `
  -StartupContract store-reviewed-immediate-registration `
  -SkipSmoke
```

Local/manual installed flow proof:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\install-and-verify-msix.ps1 `
  -StartupContract local-sideload-manual
```

Combined audit:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\audit-msix-startup-contracts.ps1
```

Most recent local audit snapshot:

- `LocalArtifactVerifyExit = 0`
- `StoreArtifactVerifyExit = 0`
- `LocalManualInstallVerifyExit = 0`
- `LatestSubmissionBundlePresent = True`
- `RemainingExternalGate = Partner Center submission + Microsoft restricted capability review`
