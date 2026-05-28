# Store Submission Metadata - 2026-05-29

**Scope**: Partner Center metadata for the MUSU Windows desktop submission.

## Current Decision

Use the Microsoft Store as the trusted Windows install channel, but do not claim
full public multi-device release readiness until the second-PC evidence gate
passes.

## Required URLs

Microsoft's Store policy says Win32/Desktop Bridge products inherently need a
privacy policy, and the policy URL must be entered in Partner Center for
products that access, collect, or transmit personal information. Microsoft also
documents that support info can be a support web page URL or support email.

Current MUSU URLs:

| Field | Value | Repo proof |
|---|---|---|
| Privacy policy URL | `https://musu.pro/privacy` | `musu-bee/src/app/privacy/page.tsx` |
| Support URL | `https://musu.pro/support` | `musu-bee/src/app/support/page.tsx` |
| Support email | `support@musu.pro` | page copy; MX resolves to `smtp.google.com`; verify actual delivery before submission |

## Listing Metadata Draft

Product name preference:

1. `MUSU`
2. `MUSU Desktop`
3. `MUSU Local`
4. `MUSU Control`

Category:

- Developer tools, or Utilities & tools if Developer tools creates review friction.

Short description:

> MUSU turns your Windows PC into a local AI operations node with a trusted dashboard, diagnostics, and task runner.

Korean short description:

> MUSU는 Windows PC를 로컬 AI 작업 노드로 만들고, 진단·대시보드·작업 실행을 한 곳에서 관리합니다.

Keywords:

- local AI
- developer tools
- desktop automation
- diagnostics
- task runner
- local dashboard
- multi-device beta

## Reviewer Notes

Use conservative product truth:

- MUSU starts a local bridge runtime.
- `musu doctor` is the operator-facing readiness diagnostic.
- The app can run user-directed local agent tasks.
- Multi-device workflows are beta-gated and require explicit peer setup/evidence.
- The local-sideload package is manual-start only.
- The Store-reviewed package is the restricted-capability startup path.
- The Tauri shell is a launcher/status surface, not the full dashboard GUI.

Avoid:

- saying Store approval proves all remote-command surfaces are safe
- saying MUSU autonomously controls machines
- bundling `musu-system` crawler/marketing/email automation into the first Store listing
- marketing broad enterprise/privacy claims before proof exists

## Pre-Submission Checks

Before uploading to Partner Center:

1. Verify `https://musu.pro/privacy` and `https://musu.pro/support` are deployed and reachable.
2. Verify `support@musu.pro` receives mail, then record evidence with `scripts\windows\record-support-mailbox-verification.ps1`, or replace the support email with a known-good mailbox.
3. Run `scripts\windows\verify-store-public-metadata.ps1 -BaseUrl https://musu.pro`.
4. Run `scripts\windows\audit-desktop-release-readiness.ps1`.
5. Run `scripts\windows\write-release-candidate-manifest.ps1`.
6. Attach the current `1.15.0-rc.1` Store-reviewed MSIX and restricted-capability justification.
7. After Microsoft certification and restricted capability approval, record the approval with `scripts\windows\record-store-release-verification.ps1`.
8. Keep `public_desktop_release_ready=false` until real second-PC evidence, support mailbox delivery, and Store release approval evidence are all recorded.

Local verification command after `npm run build`:

```powershell
cd musu-bee
npx next start -p 3015

cd ..
powershell -ExecutionPolicy Bypass -File scripts\windows\verify-store-public-metadata.ps1 `
  -BaseUrl http://127.0.0.1:3015
```

Go/no-go command:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\write-release-go-no-go.ps1 -Json
```

2026-05-29 live check:

- `verify-store-public-metadata.ps1 -BaseUrl https://musu.pro -Json` now passes for `/privacy` and `/support`.
- `Resolve-DnsName -Type MX musu.pro` returns `smtp.google.com`, but this only proves DNS routing exists.
- Treat support mailbox readiness as **not verified** until `record-support-mailbox-verification.ps1` records real delivery evidence.
- Treat Store release readiness as **not verified** until `record-store-release-verification.ps1` records Partner Center submission, Microsoft certification, and restricted capability approval evidence.

## Official References

- Microsoft Store Policies 7.19: https://learn.microsoft.com/en-us/windows/apps/publish/store-policies
- Support info for MSIX app: https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/support-info?pivots=store-installer-msix
