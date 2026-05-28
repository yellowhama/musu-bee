# Store / MSIX Restricted Capability Submission Checklist — 2026-05-27

This checklist is the operational handoff for the **Store-reviewed auto-start**
Windows package contract:

- startup contract: `store-reviewed-immediate-registration`
- manifest requirement: `rescap5:ImmediateRegistration="true"`
- custom capability: `Microsoft.nonUserConfigurableStartupTasks_8wekyb3d8bbwe`

It exists because MUSU now treats Windows packaged delivery as **two different
products**:

- `local-sideload-manual`: packaged install, manual `musu bridge`
- `store-reviewed-immediate-registration`: Store-reviewed auto-start

## What Microsoft documents

Microsoft Learn currently states:

- `desktop:StartupTask` supports `rescap5:ImmediateRegistration="true"`, and
  that setting requires the
  `Microsoft.nonUserConfigurableStartupTasks_8wekyb3d8bbwe` custom capability.
- If an app declares restricted capabilities, you must provide justification
  during the Partner Center submission process.
- Custom capabilities use the same approval path as restricted capabilities for
  Store publication.
- The Store submission API does not create the app listing for you; Partner
  Center still needs to be used to create the app and drive the submission
  workflow.

Primary references:

- `desktop:StartupTask`
  https://learn.microsoft.com/en-us/uwp/schemas/appxpackage/uapmanifestschema/element-desktop-startuptask
- App capability declarations
  https://learn.microsoft.com/en-us/windows/uwp/packaging/app-capability-declarations
- Publish apps to Microsoft Store
  https://learn.microsoft.com/en-us/windows/apps/publish/
- Microsoft Store submission API for MSI or EXE app
  https://learn.microsoft.com/en-us/windows/apps/publish/store-submission-api

## Build artifact to submit

Build the Store-reviewed artifact shape with:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\build-msix.ps1 `
  -StartupContract store-reviewed-immediate-registration
```

Verify it with:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\verify-msix-package.ps1 `
  -StartupContract store-reviewed-immediate-registration `
  -SkipSmoke
```

Expected proof:

- `StartupContract = store-reviewed-immediate-registration`
- `StartupImmediateRegistration = true`
- `HasRestrictedStartupCapability = True`

## Partner Center submission checklist

1. Create or confirm the Windows developer account in Partner Center.
2. Reserve the product name.
3. Create a new app submission for the MSIX package.
4. Upload the `store-reviewed-immediate-registration` artifact.
5. In **Properties**, confirm the packaged app metadata and category.
6. In **Submission options**, provide a restricted capability justification.
7. Add Store listing assets and required metadata.
8. Submit for certification.
9. Track certification feedback and capability approval outcome.

## Restricted capability justification packet

Prepare this before submission:

1. Capability inventory
   - `runFullTrust`
   - `Microsoft.nonUserConfigurableStartupTasks_8wekyb3d8bbwe`
2. Exact startup behavior
   - `musu-startup.exe` launches the local bridge runtime on user logon.
   - The bridge is the local control plane required for MUSU node presence,
     health checks, fleet connectivity, and user-invoked workflows.
3. Why startup is necessary
   - MUSU depends on a long-lived local bridge to keep the node present in the
     fleet and to accept user-initiated work without re-running bootstrap code.
   - The packaged app does not use raw Task Scheduler registration or
     self-managed service installation.
4. Why manual start is insufficient for the Store product
   - Manual start is acceptable only for the `local-sideload-manual` contract.
   - The Store-reviewed product contract is specifically the auto-start variant.
5. User-facing control story
   - The startup task is package-managed.
   - MUSU does not install an external scheduler or background service outside
     the package.
6. Security / trust posture
   - Packaged binaries are immutable from MUSU's point of view.
   - No self-update from GitHub.
   - No binary self-copy into `~/.musu/bin`.
   - No raw Task Scheduler registration from app code.

## Partner Center paste-ready justification

Use this as the starting point on the Submission options page:

`runFullTrust`
- MUSU is a packaged desktop control-plane application. `runFullTrust` is
  required because the app runs a full-trust local bridge process rather than a
  sandboxed UWP background task. The packaged app does not self-update its
  binaries, does not install raw Task Scheduler entries, and does not copy
  binaries into user-managed install locations.

`Microsoft.nonUserConfigurableStartupTasks_8wekyb3d8bbwe`
- MUSU uses `desktop:StartupTask` with
  `rescap5:ImmediateRegistration="true"` so the packaged bridge can be enabled
  at install time. This is the Store-reviewed Windows auto-start product
  contract. The local-sideload package is a separate manual-start contract and
  does not request this capability. `musu-startup.exe` only launches the local
  bridge runtime required for node presence, local health checks, fleet
  availability, and user-invoked workflows. MUSU does not install a separate
  background service outside the package.

## Evidence to attach internally before submission

Collect these artifacts in the repo or release packet:

1. Manifest proof
   - output of `verify-msix-package.ps1 -StartupContract store-reviewed-immediate-registration -SkipSmoke`
2. Runtime proof
   - packaged `musu package-status` output
3. Local-manual split proof
   - output of `install-and-verify-msix.ps1 -StartupContract local-sideload-manual`
4. Product decision proof
   - `docs/PRODUCT_CHARTER/WINDOWS_DISTRIBUTION_PIVOT_2026-05-27.md`
5. Packaging contract guide
   - `docs/STORE_MSIX_PACKAGING_GUIDE_2026_05_27.md`

## Current reality check

As of 2026-05-27:

- The Store-reviewed artifact shape can be built and verified locally.
- The local sideload package is intentionally **not** treated as auto-start
  proof.
- Actual restricted capability approval is still an external Partner Center /
  Microsoft review step and is not something repo-local automation can
  complete by itself.

Status ledger:

- `docs/STORE_MSIX_APPROVAL_STATUS_2026_05_27.md`
