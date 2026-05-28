# Windows Distribution Pivot — 2026-05-27

## Status

Accepted product direction.

This document records the Windows distribution pivot for MUSU:

- **Current shipping operator path**: direct-download bootstrap (`install.ps1` + GitHub release asset)
- **Target product paths**:
  - **local sideload / MSIX manual bridge runtime**
  - **Store-reviewed / restricted-capability auto-start runtime**

This is not a vague idea. It is now the intended Windows product direction.

## Current state lock

As of 2026-05-27:

- **direct-download bootstrap** remains the current operator install path
- **local sideload / MSIX manual bridge** is repo-local verified and is the truthful packaged contract for sideload
- **Store-reviewed restricted-capability auto-start** is artifact-complete but externally blocked on Partner Center verification and Microsoft review

2026-05-29 update:

- Partner Center enrollment approval cleared by operator report.
- The Store-reviewed path is no longer blocked at the account-verification step.
- It is still blocked on product-name reservation, current-version package regeneration, Partner Center app submission, Microsoft certification, and restricted-capability review.
- The prepared 2026-05-27 `1.13.0.0` submission bundle is now a template and must be regenerated for the current `1.15.0-rc.1` release target before submission.

## Why this pivot exists

The current Windows path works like an operator bootstrapper:

1. Download `musu.exe` from GitHub
2. Run `musu install`
3. Copy binaries into `~/.musu/bin`
4. Mutate user PATH
5. Register a Task Scheduler startup entry
6. Self-update from GitHub by swapping binaries under `~/.musu/bin`

That model is workable for power users, but it is not a modern end-user distribution story.

The Store/MSIX path matters because it gives MUSU:

- Microsoft-hosted installation and updates
- Microsoft code signing for the packaged build
- Windows S-Mode compatibility
- cleaner uninstall / repair semantics
- a more defensible trust story for Windows users

## Product decision

MUSU on Windows now has **two distribution modes**:

### 1. Direct-download mode

Purpose:

- operator / developer installs
- fast iteration
- GitHub release distribution
- bootstrap/service-managed background runtime

Characteristics:

- `install.ps1`
- `musu install`
- `~/.musu/bin`
- Scheduled Task startup
- self-update supported

### 2. Local sideload / MSIX mode

Purpose:

- local package validation
- enterprise/internal sideload
- packaged runtime without raw installer mutation

Characteristics:

- package identity
- package-managed install
- packaged binaries used directly
- **no self-copy into `~/.musu/bin`**
- **no Task Scheduler registration from the app**
- **no app-managed self-update**
- **no auto-start guarantee**
- operator starts the bridge manually with packaged `musu bridge`

### 3. Store-reviewed auto-start mode

Purpose:

- end-user Windows distribution
- package-managed install/update
- trust and distribution quality

Characteristics:

- package identity
- package-managed install
- packaged binaries used directly
- **no self-copy into `~/.musu/bin`**
- **no Task Scheduler registration from the app**
- **no app-managed self-update**
- **startup uses `desktop:StartupTask` with `ImmediateRegistration=true`**
- **requires Microsoft approval for the restricted startup custom capability**

## Non-negotiable Store/MSIX rules

The Store/MSIX product variant must obey these rules:

1. Package files are treated as read-only.
2. The app must not replace its own packaged binaries.
3. Windows package updates replace app binaries; MUSU does not.
4. The app must not depend on `install.ps1` for Store installs.
5. The app must not require PATH mutation as its primary launch strategy.
6. Startup must move to a package-aware mechanism, not raw Task Scheduler registration.
7. Local sideload and Store-reviewed auto-start are different product contracts and must not be treated as the same runtime guarantee.

## Product implications

This pivot means the Store/MSIX build is **not** just a wrapper around the current installer.

It is a distinct runtime path with different assumptions:

- install behavior differs
- update behavior differs
- startup behavior differs
- executable resolution differs
- some machine-control surfaces may need separate review for Store suitability

## Engineering consequences

The Windows product must be built around a runtime context split:

- **direct-download**
- **msix local-sideload manual**
- **msix store-reviewed auto-start**

Store-specific code must:

- disable self-update
- avoid writing install metadata that assumes binary self-management
- avoid Scheduled Task registration
- prefer packaged executable resolution
- make startup behavior explicit per contract:
  - local sideload: manual `musu bridge`
  - Store-reviewed: restricted-capability `ImmediateRegistration`

## Rollout shape

### Phase 1

Land runtime/context split and Store-safe guards in code.

### Phase 2

Add packaging assets and manifest-driven startup path.

### Phase 3

Package, validate, and submit the first Store-capable Windows build.

### Phase 4

Do a high-intensity product and code review of the Store build path, then close remaining gaps before calling MUSU “Store/MSIX-ready”.

## Source references

- Store/MSIX audit: `docs/STORE_MSIX_AUDIT_2026_05_27.md`
- Microsoft packaged desktop app distribution:
  https://learn.microsoft.com/en-us/windows/apps/distribute-through-store/how-to-distribute-your-win32-app-through-microsoft-store
- MSIX packaging constraints:
  https://learn.microsoft.com/en-us/windows/msix/desktop/desktop-to-uwp-prepare
