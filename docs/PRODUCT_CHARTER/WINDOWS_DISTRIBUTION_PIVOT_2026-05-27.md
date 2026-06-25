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

2026-06-26 update (V33):

- **현재 릴리스 타깃 = `1.15.0-rc.20`** (VERSION 권위 소스). 위 `1.15.0-rc.1` 언급은 2026-05-29
  시점 값이며, 현재는 rc.20.
- **번들 재생성은 코드 결함이 아니라 "아직 빌드/제출 안 함"이다 (실측 확인)**:
  `scripts/windows/prepare-store-submission-bundle.ps1`은 버전을 하드코딩하지 않는다 — build-msix.ps1을
  호출(VERSION 자동 추종)하고 `Find-LatestMsixArtifact`로 방금 빌드한 산출물을 집는다. 따라서
  `-SkipBuild` 없이 실행하면 **항상 현재 VERSION으로 번들을 생성**한다. 디스크에 남아있는 `1.13.0.0`
  번들은 옛 산출물일 뿐, 스크립트가 1.13을 박는 게 아니다.
- 따라서 남은 Store blocker는 전부 **외부/operator 게이트**(코드 아님): product-name 예약, 현재버전 번들
  실제 생성·검증, Partner Center 제출, MS 인증, restricted-capability(`runFullTrust` +
  `nonUserConfigurableStartupTasks`) 리뷰. 코드/스크립트 측 준비는 정합 완료.
- V33 정합분: 식별자 드리프트(`Yellowhama.MUSU`→`blossompark.musu`) 정리(WS-1), 버전 일관성 게이트에
  `src-tauri\Cargo.toml` 추가(WS-2). 이로써 번들 생성 시 버전 사각지대 제거.
- EV 직접서명 대안 트랙은 `docs/GA_EV_SIGNING_DESIGN_2026_06_26.md`에 큐잉(Store와 상호 배타 아님).

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
