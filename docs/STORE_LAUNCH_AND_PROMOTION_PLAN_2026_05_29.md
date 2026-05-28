# Microsoft Store Launch and Promotion Plan — 2026-05-29

This document records the updated Store launch plan after the operator reported that Partner Center enrollment approval cleared.

It intentionally ignores product names from outside MUSU. The useful carry-over from the external note is only:

- Microsoft Store should be treated as the trusted Windows install channel.
- MSIX is the preferred path when the app can satisfy Store/MSIX constraints.
- EXE/MSI is only a fallback and has stricter hosting/signing/offline-installer obligations.
- Promotion should be measured by install and first-run funnel, not vanity traffic.

## Current State

Partner Center account approval is no longer the blocking item.

That does **not** mean the app itself is approved. The remaining gates are now:

1. reserve the product name
2. regenerate a current Store-reviewed package for `1.15.0-rc.1`
3. re-run the Store/MSIX verification scripts
4. create the Partner Center app submission
5. submit the restricted-capability auto-start justification
6. wait for Microsoft app certification / capability review

2026-05-29 packaging update:

- `musu_1.15.0.0_x64_local-sideload-manual.msix` regenerated and verified.
- local-sideload workflow passed packaged startup smoke using release `musu-startup.exe`.
- `musu_1.15.0.0_x64_store-reviewed-immediate-registration.msix` regenerated and verified.
- Store-reviewed manifest has `ImmediateRegistration=true` and the restricted startup custom capability.
- current submission bundle: `.local-build\msix\submission-bundles\store-reviewed-20260529-033609`
- still pending: Partner Center app submission, Microsoft certification, and restricted capability approval.

Critical correction:

- The prepared 2026-05-27 submission bundle is useful as a template.
- It contains `musu_1.13.0.0_x64_store-reviewed-immediate-registration.msix`.
- The current beta target is `1.15.0-rc.1`.
- Therefore the 1.13 package must not be submitted as the current Store candidate.
- The current Tauri scaffold is not the release-grade desktop shell yet (`0.1.0`, dev identifier, static `../out` assumption). Store submission should use the verified Rust packaged runtime path until the GUI shell is aligned and tested.

## Packaging Decision

Primary path:

- **MSIX + Store-reviewed restricted-capability auto-start**

Reason:

- The repo already has MSIX packaging scripts, contract-specific artifacts, and restricted startup capability review materials.
- Store MSIX gives the cleanest trust story for Windows users and keeps package-managed install/update separate from direct-download self-update.

Fallback path:

- **EXE/MSI Store listing**

Use only if MSIX certification blocks on a technical or policy issue that cannot be resolved quickly.

Fallback constraints:

- installer URL must be HTTPS and versioned
- installer binary at that URL must not change after submission
- installer must be standalone/offline, not a downloader
- EXE/MSI path requires code signing and silent install handling
- fallback must not blur the existing Store/MSIX contract split

## Partner Center Submission Steps

1. Reserve the product name.
   - Try `MUSU`.
   - If unavailable, try `MUSU Desktop`, `MUSU Local`, or `MUSU Control`.
   - Do not use names from other internal products.

2. Regenerate the Store-reviewed artifact for `1.15.0-rc.1`.
   - Rebuild package.
   - Regenerate submission bundle.
   - Verify manifest still has the restricted startup capability and `ImmediateRegistration=true`.
   - Use `run-msix-workflow.ps1 -Configuration release`; this now forwards the configuration into `verify-msix-package.ps1` so release packages are verified with release `musu-startup.exe`.

3. Re-run proof commands.

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\audit-msix-startup-contracts.ps1

powershell -ExecutionPolicy Bypass -File scripts\windows\verify-msix-package.ps1 `
  -StartupContract store-reviewed-immediate-registration `
  -SkipSmoke
```

4. Create the Store submission.
   - Product type: MSIX/PWA path, not EXE/MSI, unless fallback is invoked.
   - Category: Developer tools or Utilities & tools.
   - Markets: start narrow if policy risk is high; expand after first approval.

5. Add certification notes.
   - Explain local bridge.
   - Explain local agent task execution.
   - Explain P2P / local network behavior.
   - Explain file access and remote command surfaces.
   - Explain why startup registration is needed and how the user can control/disable it.

6. Record Microsoft result back into repo docs before changing code.

## Store Listing Positioning

Short English line:

> MUSU turns your Windows PC into a local AI operations node with a trusted dashboard, diagnostics, and task runner.

Short Korean line:

> MUSU는 Windows PC를 로컬 AI 작업 노드로 만들고, 진단·대시보드·작업 실행을 한 곳에서 관리합니다.

Avoid:

- "AI controls everything automatically"
- "cloudless enterprise platform"
- claims that Store approval guarantees every machine-control surface
- marketing other products under the MUSU Store listing

Use concrete outcomes:

- start local services with `musu up`
- check readiness with `musu doctor`
- see bridge/dashboard status
- run a local Claude task
- prepare multi-machine workflows after beta hardening

## Screenshot Order

1. First-run / `musu up`
2. `/fleet` doctor readiness
3. Local device status
4. Task submission
5. Task result / history
6. Settings or Store-safe startup behavior

## Promotion Plan

Do not launch broad promotion until Store install + first-run smoke passes from a clean Windows machine.

Initial channels:

- `musu.pro` download page with Store badge / Store Web Installer
- GitHub README top badge
- release blog: "Why MUSU is using Microsoft Store as the trusted Windows channel"
- X / LinkedIn short demo
- Hacker News / Reddit only after install failure rate is acceptable
- Korean developer community post after Korean listing copy is ready

Campaign IDs:

- `website_launch`
- `github_readme`
- `store_blog`
- `x_launch`
- `linkedin_devtools`
- `hackernews`
- `reddit_selfhosted`
- `kr_dev_community`

## Metrics

Track the Store funnel in this order:

1. Store page views
2. install attempts
3. successful installs
4. first launch
5. `/api/doctor` overall ok
6. first task submitted
7. first task reaches `done`

MUSU-specific activation metric:

> first successful local task through dashboard or CLI within 15 minutes of install.

Do not optimize for likes, launch-day comments, or broad impressions before this funnel is healthy.

## Official Reference Snapshot

Checked on 2026-05-29:

- Microsoft app name reservations: https://learn.microsoft.com/en-us/windows/apps/publish/partner-center/msix/manage-app-name-reservations
- Microsoft MSI/EXE package upload requirements: https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msi/upload-app-packages
- Microsoft code signing options: https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options
- Microsoft Store Web Installer: https://learn.microsoft.com/en-us/windows/apps/distribute-through-store/how-to-use-store-web-installer-for-distribution
- Microsoft Partner Center insights: https://learn.microsoft.com/en-us/partner-center/insights/apps-and-games-overview
- Microsoft winapp CLI Tauri MSIX guide: https://learn.microsoft.com/ko-kr/windows/apps/dev-tools/winapp-cli/guides/tauri
- Tauri Microsoft Store guide: https://v2.tauri.app/distribute/microsoft-store/
