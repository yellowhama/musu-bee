# MUSU Microsoft Store Release Run Card - 2026-05-29

**Scope**: MUSU 1.15.0-rc.1 Windows desktop release. This is the operator-facing run card for the remaining Microsoft Store and second-PC gates.

## Verdict

MUSU is not public Store-release ready yet.

Current verified state:

- local release artifacts are ready
- public `/privacy` and `/support` metadata are reachable
- current single-machine evidence is recorded and verified
- final operator gate packet exists and verifies cleanly
- GitHub Actions `Tests` passed on `a4d7fc467e157f871972fb8837157ba3a641ec30`

Remaining release blockers:

1. clean/current second-PC MSIX install evidence
2. real second-PC multi-device routing evidence
3. real `musu@musu.pro` inbox delivery evidence
4. Partner Center product-name reservation, app submission, Microsoft certification, and restricted capability approval evidence

## Product Boundary

Ignore other-product copy such as HiveLink/Vibe PM. For this release, the Store product is MUSU desktop:

> MUSU turns your Windows PC into a local AI operations node with a trusted dashboard, diagnostics, and task runner.

Do not bundle or market `musu-system`, `musu-crawl-ai`, `musu-marketer`, or `musu-nurikun` in the first Store package. Those are valuable adjacent ecosystem tools for later optional MCP/CLI/bridge integration.

## Package Path Decision

Use MSIX first.

Current official Microsoft docs still support the core release decision:

- Microsoft Store MSIX distribution is the preferred trust/install path for most Windows apps, and Store-submitted MSIX packages are re-signed by Microsoft after certification.
- MSI/EXE Store submissions remain possible, but the publisher must sign the installer and keep package URLs version-fixed if using the MSI/EXE URL path.
- MSIX/packaged desktop apps with restricted capabilities such as `runFullTrust` require restricted-capability explanation/approval during Store submission.

MUSU-specific path:

1. Submit the current Store-reviewed MSIX first.
2. Keep Tauri MSI/NSIS as fallback and diagnostic artifacts, not the primary Store path.
3. Keep public release readiness false until second-PC install/routing, support mailbox, and Store approval evidence are recorded.

## Exact Operator Sequence

### 1. Check Status

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\show-final-release-handoff-status.ps1
```

Expected now:

- `ready_for_public_desktop_release=false`
- packet verified
- blockers are `msix-install`, `multi-device`, `support-mailbox`, and `store-release`

### 2. Prepare The Second-PC Kit

Use the latest packet:

```text
.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-latest.zip
```

Copy only the zip inside `kits\` to the second Windows PC. Do not copy the whole repo or packet as the execution root.

### 3. Capture Second-PC MSIX Install Evidence

On the second Windows PC, unzip the kit and run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\run-second-pc-release-check.ps1
```

If certificate trust fails, rerun from elevated PowerShell with `-MachineTrust`.

Manual fallback:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\install-and-verify-msix.ps1 -StartupContract local-sideload-manual -ReplaceExisting
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\capture-msix-install-evidence.ps1 -StartupContract local-sideload-manual
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\collect-second-pc-handoff.ps1
```

Return the generated `.local-build\msix-install\*.evidence.json` file and
`.local-build\second-pc-handoff\*.handoff.json` file to the release repo. Also
return `.local-build\second-pc-release-check\*.release-check.json` when using
the wrapper. Record the install evidence:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\record-msix-install-evidence.ps1 `
  -EvidencePath .local-build\msix-install\<INSTALL_EVIDENCE_JSON> `
  -Json
```

### 4. Capture Multi-Device Evidence

On the second PC:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\collect-second-pc-handoff.ps1
```

Use one `suggested_remote_addrs` value from the returned
`.local-build\second-pc-handoff\*.handoff.json` file.

On the primary release machine:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\show-second-pc-return-card.ps1 -HandoffPath .local-build\second-pc-handoff\<HANDOFF_JSON>
```

Then run the printed multi-device command, or fill it manually:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\smoke-multidevice-beta.ps1 `
  -RemoteAddr <SECOND_PC_IP_OR_TAILSCALE_IP>:<BRIDGE_PORT> `
  -RemoteName <SECOND_PC_NODE_NAME> `
  -RouteTarget <SECOND_PC_NODE_NAME>
```

Then record:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\record-multidevice-evidence.ps1 `
  -EvidencePath .local-build\multi-device\<EVIDENCE_JSON> `
  -Json
```

### 5. Verify Support Mailbox

Send a real external email to `musu@musu.pro` with a subject/body containing a `musu-...` token, then record evidence after confirming it is visible in the actual inbox:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\record-support-mailbox-verification.ps1 `
  -FromAddress "<sender@example.com>" `
  -ReceivedBy "<operator-name>" `
  -VerificationId "musu-store-support-1.15.0-rc.1-<unique-token>" `
  -Notes "Verified delivery in musu@musu.pro inbox" `
  -Json
```

DNS MX alone is not enough; this gate requires inbox delivery proof.

### 6. Submit In Partner Center

Before uploading, verify the current Store submission bundle:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\verify-store-submission-bundle.ps1
```

In Partner Center:

1. reserve product name, starting with `MUSU`
2. record the exact reservation timestamp for `-ProductNameReservedAt`
3. upload the Store-reviewed MSIX package
4. include the restricted-capability explanation for the packaged desktop/runtime behavior
5. submit for Microsoft certification
6. wait for certification and restricted capability approval

After approval:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\record-store-release-verification.ps1 `
  -ProductName "MUSU" `
  -ProductNameReservedAt "<partner-center-name-reserved-at>" `
  -SubmissionId "<partner-center-submission-id>" `
  -CertificationStatus "approved" `
  -RestrictedCapabilityStatus "approved" `
  -RecordedBy "<operator-name>" `
  -Notes "Microsoft Store certification and restricted capability review approved" `
  -Json
```

### 7. Final Go/No-Go

When all four evidence files exist:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\complete-final-operator-gates.ps1 `
  -MsixInstallEvidencePath .local-build\msix-install\<INSTALL_EVIDENCE_JSON> `
  -MultiDeviceEvidencePath .local-build\multi-device\<EVIDENCE_JSON> `
  -SupportFromAddress "<sender@example.com>" `
  -SupportReceivedBy "<operator-name>" `
  -SupportVerificationId "<support-verification-id>" `
  -SupportNotes "Verified delivery in musu@musu.pro inbox" `
  -StoreProductName "MUSU" `
  -StoreProductNameReservedAt "<partner-center-name-reserved-at>" `
  -StoreSubmissionId "<partner-center-submission-id>" `
  -StoreCertificationStatus "approved" `
  -StoreRestrictedCapabilityStatus "approved" `
  -StoreRecordedBy "<operator-name>" `
  -StoreNotes "Microsoft Store certification and restricted capability review approved" `
  -FailOnNotReady `
  -Json
```

The release is public-ready only when `write-release-go-no-go.ps1 -FailOnNotReady -Json` exits successfully and reports `ready_for_public_desktop_release=true`.

## Current Official References Checked

- Microsoft code signing options for Windows app developers: https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options
- Publish your first Windows app: https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/publish-first-app
- MSIX app certification process: https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/app-certification-process/
- Reserve your MSIX app name: https://learn.microsoft.com/windows/apps/publish/publish-your-app/msix/reserve-your-apps-name
- MSI/EXE upload package URL requirements: https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msi/upload-app-packages
- Restricted capability declarations: https://learn.microsoft.com/en-us/windows/uwp/packaging/app-capability-declarations
