# 핸드오프 — 재설치 복원력 (V29→V31) + V33 잔여 마무리, 2026-06-26

> 다른 에이전트/엔지니어용. 이번 세션(2026-06-25~26)에 main에 들어간 것, 미해결, 다음 행동.
> main HEAD `f9eadede`(V29-31). **V33은 브랜치 `feat/v33-residual-finalize`로 push되어 PR #34에 있음
> (main 미머지 — design-gate 승인 대기).**
> 버전 **rc.21**.

## 2026-06-27 rc.22 release-channel follow-up

현재 public install channel은 **1.15.0-rc.22 / MSIX 1.15.0.22**로 올라갔다. 목적은 brain ingest
token ACL hardening이 포함된 패키지를 `musu.pro` 설치 경로로 실제 배포하는 것.

- `desktop-latest` GitHub release assets 재빌드/업로드 완료:
  `musu-desktop-x64.msix` length `40686791`, `musu.appinstaller` length `768`,
  `Install-MUSU.ps1` length `16587`.
- `musu.pro` production deploy `dpl_ALoaFRtPhb18RkfEc6WmaDJUFijR`가 `https://musu.pro`에 alias됨.
- `verify-musu-pro-install-channel.ps1 -Json` 통과: `ok=true`, `failure_count=0`,
  `/api/health` 및 `/api/public-config`는 `1.15.0-rc.22`, `/install.ps1`는
  `ExpectedReleaseVersion="1.15.0-rc.22"`.
- GitHub `desktop-latest` stable URL은 `--clobber` 직후 rc.21 content를 잠시 반환했다. 그래서
  public release asset URL, generated `.appinstaller` `Uri`/`MainPackage Uri`, 그리고
  `Install-MUSU.ps1` appinstaller download에 `?rc=1.15.0.22` cache-buster를 추가했다.
- Windows PowerShell 5.1 `irm/iex` validation에서 `Install-MUSU.ps1`의 unbraced
  appinstaller URL interpolation이 `?rc=1.15.0.22`를 잃는 버그를 노출했다. installer는
  TLS 1.2 bootstrap + braced URL (`${ReleaseBase}/${AppInstallerFileName}?rc=${expectedPackageVersion}`)
  형태로 고쳤고, hardened script를 `desktop-latest`에 재업로드했다.
- `musu-brain.pin.json`은 `F:\musu_2nd_brain` clean HEAD
  `2f036728a9e6d5840634666d7442be87d302f083`로 갱신됨. 첫 rc.22 build는 pin이 옛
  `f7678af...`라서 실패했고, 이 fail-closed gate가 정상 동작했다.
- `build-msix.ps1 -NoBump -PreflightOnly`가 추가되어 version coherence + brain pin/clean checkout을
  긴 Rust/Tauri/MSIX build 전에 빠르게 검증한다.
- 현재 second PC에 설치된 패키지는 아직 `1.15.0.21`이다. rc.22는 hosted install/update channel에
  올라간 상태이며, physical `hugh-main` 설치/repair/direct-route proof와 packaged first-run brain
  token proof는 아직 남아 있다.

상세 감사/다음 단계: `RELEASE_1_15_0_RC22_INSTALL_CHANNEL_AUDIT_NEXT_STEPS_2026_06_27.md`.

## V33 잔여 마무리 (브랜치 feat/v33-residual-finalize, 2026-06-26)
사용자 /goal: W-4 relay-fallback + GA EV/Store 잔여를 마스터→투두→/loop 구현. Phase 0 리서치로 8 WS로 분해.
| WS | 무엇 | 커밋 |
|----|------|------|
| WS-1 | stale `Yellowhama.MUSU`→`blossompark.musu` 식별자 정합(7 scripts; runtime detection OR-compat, canonical artifact hard-replace, fixture 6 교체). 호환 5 audit 스크립트 보존. | 91af8801 |
| WS-2 | 버전 일관성 게이트에 `src-tauri\Cargo.toml` 추가(사각지대 제거, dry-run 실증) | d7a337d8 |
| WS-3 | `Install-MUSU.ps1` 견고화 4종(Root cert/0x800B0109 핸들/elevated 에러 trap+pause/PSCommandPath 분기). +버그: irm\|iex param() 리셋이 `$NoLaunch` 날리던 latent 버그 scriptblock 바인딩으로 수정. thumbprint 핀 보존. | b16060bc |
| WS-4 | Store 문서 정합 — **실측: prepare-store-submission-bundle.ps1은 VERSION 추종(하드코딩 없음)**, 1.13.0.0은 옛 디스크 산출물. 남은 blocker 전부 외부 게이트. | c902b554 |
| WS-5a | `fleet.rs` probe→fallback 통합테스트 — `map_probe_response`(ProbeOutcome enum) 추출 + MED-2 direct-override 테스트 2개(0 커버리지였음). cargo 519/519. | b16060bc |
| WS-5b | E2E 3-state 플레이북 정정 — "transited:true relay forward" 모순 제거(표시 flip≠relay 라우팅, router.rs:170 relay 미구현). | 91af8801 |
| WS-6 | 테스트 안전망 복구(audit 발견) — cockpit-contract RED 3개(전부 drift, 의미 보존 갱신, #53 보안 7종 보존) + `test:tauri-shell` CI 연결 + meshBearer/신규 mesh-bearer route.test.ts CI 연결. cockpit 53/53. | 1fb6d564 |
| WS-7 | GA EV 직접서명 설계 큐잉(`GA_EV_SIGNING_DESIGN_2026_06_26.md`, Store 메인·EV 대안). | 91af8801 |

**V33 독립 감사(quality-engineer Auditor): SHIP — 0 HIGH / 0 MEDIUM.** 전체 diff 코드 실측 재확인:
WS-3 보안(핀 보존+Root는 게이트 AFTER+0x800B0109 rethrow+pause 가드+무한루프 없음), WS-6 #53 보안 단언
net-강화(cloud_deregister_self 추가), RED-3은 진짜 test-drift(코드가 앞서감). 519/53/4 통과, 9 PS 파싱 0 에러.

**V33 핵심 배운 것**: (1) **fleet 3-state는 표시/판정 레이어일 뿐 — 실제 task 라우팅은 relay 미선택**
(router.rs:170, QUIC 터널 미구현). "노랑=relay 표시" ≠ "relay로 forward". 플레이북이 이걸 혼동했었음.
(2) `irm|iex`로 받은 스크립트의 `param()` 블록은 호출자 switch를 **재선언/리셋** → scriptblock 바인딩 필요.
(3) cockpit-contract 류 source-string-pin 테스트는 리팩터에 drift — 정확한 문자열 대신 **의미**를 단언해야.
(4) V33 다음 단계는 `NEXT_STEPS_V34_2026_06_26.md`.

**V33 상태 (2026-06-26)**: 브랜치 `feat/v33-residual-finalize` → **origin push + PR #34** (main
머지는 design-gate/사용자 승인 게이트). 정식 스펙 `FLEET_RETRY_AND_LAST_SEEN_CONTRACT_2026_06_12.md`의 relay state
기술("delegated work routes over the relay")이 코드와 모순이라 V33 정정 반영(표시 레이어 명문화).
closure: `CLOSURE_V33_RESIDUAL_FINALIZE.html`. musubrain 인덱싱 완료(문서 5 + 코드 3: fleet.rs/
Install-MUSU.ps1/build-msix.ps1 + 스펙). 메모리 2건: `reference-musu-fleet-3state-display-only`,
`reference-powershell-iex-param-reset`.

**2026-06-26 late addendum — brain bonding 1차 구현**: 사용자 thesis
`BRAIN_INTEGRATION_THESIS_2026_06_26.md`의 "메인보드+칩" 모델을 현재 branch 작업에 합류시켰다.
Go brain chip(`F:\musu_2nd_brain`)은 코드 변경 없이 유지하고, `musu-bee`가 번들/lifecycle/data/ingest를
소유한다.

- `src-tauri/tauri.conf.json` externalBin에 `binaries/musu-brain` 추가.
- `scripts/build-tauri-sidecars.mjs`가 brain repo pin(`src-tauri/musu-brain.pin.json`)의
  `product_version`/`vcs_revision`/clean tree를 확인하고 Go sidecar를 굽는다.
- `scripts/windows/build-msix.ps1`는 brain pin을 5번째 version source로 검사하고, staged
  `musu-brain.exe`의 Go build info `vcs.revision`/`vcs.modified=false`를 검증한다.
- Tauri는 `~/.musu/brain`을 단일 data root로 정하고 `musu-brain init/auth issue/server`를 loopback
  sidecar로 준비한다. Runtime bridge에는 `MUSU_KNOWLEDGE_*` env를 주입한다.
- `musu-rs/src/writer/runner.rs`는 task 완료 시 markdown source를 non-blocking으로 brain
  `POST /v1/sources`에 ingest한다. 실패는 task 완료를 깨지 않고 warn/debug로만 남긴다.
- 네이밍은 Go 지식엔진 통합에 `knowledge_*`를 사용해 기존 `musu-rs/src/brain/*` 태스크
  오케스트레이터(:8888)와 분리했다.

정직한 잔여: brain chip에 native product semver surface가 없어 현재 gate는 pin+VCS gate다.
`~/.musu/brain/runtime/musu-ingest.token`은 값 로그 금지/파일 저장까지 구현됐지만 owner-only ACL verifier는
아직 release gate가 아니다. packaged first-run에서 sidecar spawn, token 생성, `/health`, 실제 task ingest까지
증명해야 release-grade다. 자세한 audit/next steps는
`FLEET_AND_BRAIN_BONDING_AUDIT_NEXT_STEPS_2026_06_26.md`.

---

## (V29-31) TL;DR (한 문장)

## TL;DR (한 문장)
musu fleet이 **재설치/포트변경/업데이트에도 손 안 대고 복원**되도록 4겹 근본수정을 머지했고
audit hotfix + cleanup CLI까지 포함한 **rc.21 MSIX 산출/second 설치 검증 완료**. `musu.pro`
production install channel도 rc.21로 배포 완료. 남은 핵심은 PR #34 design-gate 승인과
hugh-main 물리 머신을 rc.21로 1회 올려 non-loopback URL/direct route를 실증하는 것.

## 머지된 것 (PR #29~#33)
| 영역 | 무엇 | 근본 원인 | 파일 |
|------|------|----------|------|
| **DPAPI**(#29) | mesh.env bearer Windows at-rest 암호화 | 평문 저장 | `musu-rs/src/install/token.rs` (dpapi_protect/unprotect, `MUSU_MESH_BEARER_DPAPI=`), `bridge/mod.rs` watcher spawn_blocking |
| **cockpit jargon**(#30) | 네트워킹 용어 평이체 + release-evidence `<details>` 강등 | thesis(작업위임)에 jargon 노출 | `src-tauri-shell/index.html`+`main.js`, 테스트 2종 |
| **dead code**(#31) | `restart_app` 제거 + B-7 login env docs | — | `lib.rs`, `docs/CONFIG.md` |
| **fleet 주소**(#32) | 레지스트리 진실원천 + ghost prune + mDNS 무조건 광고 | identity가 host:port에 묶임 / mDNS opt-in 게이트 OFF | `musu-rs/src/peer/discovery.rs`(`resolve_all_peers` name-authority, `reconcile_manual_against_registry`), `bridge/mod.rs`(heartbeat prune, mDNS advertise ungated) |
| **bearer 정합**(#33) | account bearer heartbeat 자동정합 | 재설치 머신이 per-machine 토큰 fallback, auto_join soft-fail | 신규 `GET /api/account/mesh-bearer`, `cloud/mod.rs::request_mesh_bearer`, `bridge/mod.rs` ensure(compare-then-write) |
| **토스트 update**(#33) | helper `-ForceTargetApplicationShutdown` | 수동 kill-loop가 lock-holder 놓침 → 0x80073D02 | `lib.rs::update_helper_script` |

## 핵심 불변식 (건드리면 깨짐)
1. **fleet 주소 = musu.pro 레지스트리(cache)가 진실원천**. `resolve_all_peers`가 레지스트리에 있는
   node_name의 manual/nodes.toml stale addr를 배제. 라우팅도 같은 함수 공유 → display+routing 동시.
   node_name이 안정 식별자(서버가 uniqueness 강제: `nodeRegistryStore.ts` sha256(owner+name) upsert).
2. **bearer = stable HMAC**(account당 동일 64-hex). heartbeat ensure는 **compare-then-write**(다를
   때만 write — DPAPI 재암호화/watcher churn 회피). best-effort, login은 soft-fail 유지.
3. **prune 가드**: 빈 레지스트리=no-op(데이터유실 방지), same-name-different-addr만 제거, LAN-only 보존.
4. **토스트 helper**: OS가 패키지 인스턴스 종료(`-ForceTargetApplicationShutdown`), 수동 kill 금지.
   helper는 `$env:TEMP`(패키지 밖)라 자기 안 죽음.

## ✅ 해소됨 (2026-06-26 실측, audit hotfix 포함)
- ✅ **hugh_second 설치 패키지까지 rc.21 audit hotfix 반영 완료**. WindowsApps 실행 경로:
  `C:\Program Files\WindowsApps\blossompark.musu_1.15.0.21_x64__f5h38pf4yt4gc\musu.exe`.
  최신 재설치/재시작 후 packaged bridge PID `14084`, service registry `0.0.0.0:7476`,
  local URL `127.0.0.1:7476`, advertised URL `192.168.1.154:7476`.
- ✅ **install.ps1 0x8008020C root cause 해결(기존 rc.20 기준)**: 정식 자산
  `musu-desktop-x64.msix`가 옛 rc.18을 담고 있었음 → rc.20 재업로드(28087754 bytes),
  정식 다운로드 경로 content-length 실측 일치 확인. 메모리
  `reference-musu-desktop-latest-canonical-asset` 참조.
- ✅ **2026-06-27 KST 재확인**: live `desktop-latest`는 rc.21이다.
  guarded `publish-desktop-latest-assets.ps1 -ConfirmUpload`로 GitHub release 자산을 clobber upload했고,
  `verify-musu-pro-install-channel.ps1 -Json`은 `ok=true`, `failure_count=0`.
  hosted `musu.appinstaller`/MainPackage는 `Version="1.15.0.21"`, hosted
  `Install-MUSU.ps1`는 `ExpectedReleaseVersion="1.15.0-rc.21"`, hosted
  installer/uninstaller/repair script hash는 local canonical과 일치한다.
- ✅ **desktop-latest drift guard 강화**: `scripts\windows\canary-desktop-release.ps1`는 이제
  HTTP 200만 보지 않고 repo `VERSION` → expected package version(`1.15.0-rc.21` →
  `1.15.0.21`), hosted `musu.appinstaller`의 AppInstaller/MainPackage Version, hosted
  `Install-MUSU.ps1`의 `ExpectedReleaseVersion`/cert pin, hosted cert thumbprint,
  hosted `Install-MUSU.ps1`/`Uninstall-MUSU.ps1` SHA256 vs local canonical script,
  hosted `musu-desktop-x64.msix` Content-Length vs local hosted-name copy length, hosted
  setup exe Content-Length vs local NSIS exe length까지 검증한다. schema는
  `musu.desktop_release_canary.v6`. 현재 live 실행은 통과한다
  (`public_version=1.15.0-rc.21`, `appinstaller_version=1.15.0.21`,
  hosted installer/repair script hash match).
- ✅ **desktop-latest publish path 고정**: `scripts\windows\publish-desktop-latest-assets.ps1`
  추가. `-DryRun`은 실제 업로드 없이 local `audit-appinstaller-contract.ps1`, VERSION/publicRelease,
  hosted-name MSIX vs versioned MSIX length, appinstaller Version, `Install-MUSU.ps1`
  `ExpectedReleaseVersion`, pinned cert thumbprint, `Uninstall-MUSU.ps1`, NSIS setup exe 존재/이름을
  검증한다. `-ConfirmUpload`를 명시해야만 `gh release upload desktop-latest --clobber`를 실행하며,
  업로드 대상은 `musu-desktop-x64.msix`, `musu.appinstaller`, `blossompark.musu.cer`,
  `Install-MUSU.ps1`, `Uninstall-MUSU.ps1`, `repair-fleet-node-public-url.ps1`,
  `MUSU_1.15.0_x64-setup.exe` 전체다.
  2026-06-27에 `-ConfirmUpload` 실행 완료했고 desktop-latest canary가 통과했다.
- ✅ **Install-MUSU.ps1 자체 stale-release guard 추가**: script param
  `ExpectedReleaseVersion="1.15.0-rc.21"`이 repo `VERSION`과 계약 테스트로 묶였고,
  설치 전에 `https://musu.pro/api/public-config`의 `releaseVersion` 및 downloaded
  `musu.appinstaller`의 AppInstaller/MainPackage Version을 검증한다. `-ValidateReleaseOnly`는
  관리자 권한/인증서 신뢰/설치 없이 같은 검증만 수행한다. 현재 live 상태에서
  `Install-MUSU.ps1 -ValidateReleaseOnly`는 의도대로 실패:
  `musu.pro is publishing releaseVersion '1.15.0-rc.20', but this installer expects '1.15.0-rc.21'`.
  `-ExpectedReleaseVersion 1.15.0-rc.20 -ValidateReleaseOnly`는 통과해 비교 로직 자체도 확인됨.
- ✅ **pasted fleet audit 5건 중 hugh_second/source/package 범위 해소**:
  `CachedNode.last_heartbeat`는 registry `last_seen`만 보존하고 `Utc::now()` fabrication 제거.
  remote sibling `public_url=127.0.0.1`/wildcard는 server registry write/list path에서 reject/filter하고
  resolver/cache에서도 제외. `online_nodes`는
  direct/healthy only. `~/.musu/services/bridge.json`는 raw bind(`0.0.0.0`)를 기록하고 doctor는
  normalized local addr와 `service_registry_bind_addr`/`advertised_public_url`를 분리. `tls/key.pem`와
  `private_mesh.toml`은 owner-only ACL로 제한.
- ✅ **IPv4-mapped loopback/wildcard edge guard**:
  `public_url` / cached route 후보가 `[::ffff:127.0.0.1]` 또는 `[::ffff:0.0.0.0]`처럼 IPv4-mapped
  IPv6로 들어와도 loopback/wildcard와 동일하게 unusable로 판정한다. TS registry(`nodeRegistryStore.ts`)
  와 Rust registry/resolver(`bridge::is_routable_remote_host`, `peer::discovery::is_remote_usable_addr`)
  양쪽에 테스트를 추가했다. 후속 보강으로 `musu doctor` / `musu nodes` 경고 helper와
  `verify-fleet-audit-contract.ps1 -SelfTestRemoteUsable`도 같은 판정을 사용한다.
- ✅ **V34 route candidate preflight 1차 bonding**:
  `forward_to_peer_with_retry`는 rendezvous target `candidate_endpoints`와 selected peer를 합친 뒤,
  task POST 전에 read-only `/api/fleet/node-status` preflight를 짧게 병렬 실행해 reachable 후보를 앞으로
  당긴다. 실제 `/api/tasks/forward` POST는 한 후보씩만 보내므로 stale 첫 후보의 지연은 줄이되 중복 실행은
  만들지 않는다. 남은 증명은 두 물리 머신에서 stale-first 후보 재현 + reachable LAN 후보 선점 + task
  중복 없음 확인이다.
- ✅ **V34 server registry presence TTL 1차 bonding**:
  `nodeRegistryStore.ts::listNodes`는 이제 storage retention(`expires_at`,
  `MUSU_NODE_REGISTRY_TTL_SEC`, default 7일)과 current presence freshness(`last_seen`,
  `MUSU_NODE_REGISTRY_HEARTBEAT_TTL_SEC`, default 15분)를 분리한다. 따라서 stale cloud row를
  보관/삭제 가능 상태로 남길 수는 있지만, heartbeat TTL을 넘긴 row는 `/api/v1/nodes` discovery/current
  fleet presence로 내려가지 않는다. `deleteNodeByName` / `DELETE /api/v1/nodes/[nodeName]`는 숨겨진
  stale row cleanup을 계속 허용한다.
- ✅ **musu.pro production health route source 추가**:
  deploy workflow와 `AGENT_DEPLOY_MUSU_PRO_SITE.md`가 기대하는 `GET /api/health`가 source에 없어서
  live `https://musu.pro/api/health`가 404를 반환했다. 신규 `src/app/api/health/route.ts`는
  `musu.site_health.v1`, `ok=true`, `service=musu.pro`, `version=PUBLIC_RELEASE_VERSION`을 no-store로
  반환한다. `src/app/api/health/route.test.ts`로 unauth 200 contract 고정.
- ✅ **packaged evidence**: `scripts\windows\build-msix.ps1 -Configuration release -StartupContract
  local-sideload-manual -GenerateCert -KeepStage -NoBump`로 `musu_1.15.0.21_x64_local-sideload-manual.msix`
  재컷, 로컬 hosted-name copy `musu-desktop-x64.msix`와 `musu.appinstaller`도 1.15.0.21 기준으로 갱신됨.
  단, 실제 GitHub `desktop-latest` hosted asset은 아직 rc.20이라 별도 업로드 gate가 남아 있다.
  `verify-msix-package.ps1 -Configuration release -StartupContract local-sideload-manual` 통과,
  `install-and-verify-msix.ps1 -StartupContract local-sideload-manual -ReplaceExisting` 통과.
  `smoke-packaged-startup.ps1`는 새 계약(local probe loopback, node-status advertised LAN addr)을 검증하도록 갱신.
  VERSION / Cargo / Tauri / publicRelease / package.json / package-lock 모두 `1.15.0-rc.21`로 정렬했고,
  `audit-desktop-release-readiness.ps1 -Json`의 version/desktop-shell checks는 pass. 해당 감사의 남은 fail은
  기존 외부 Store submission bundle(`1.15.0.0`, cert 누락)과 옛 multi-device evidence(`1.15.0-rc.1`)라
  이번 local-sideload rc.21 package readiness와는 별도 gate. GitHub `desktop-latest` hosted asset도
  2026-06-27 production follow-up에서 rc.21로 갱신됐다.
- ✅ **musu.pro registry source deploy-readiness**: `musu-bee` registry guard test
  `npx tsx --test src/app/api/health/route.test.ts src/lib/nodeRegistryStore.test.ts src/app/api/v1/nodes/register/route.test.ts`
  32/32 통과(health route + heartbeat presence TTL + hidden stale cleanup coverage 포함). `npm run build` production build 통과(Next 16.2.7, `/api/v1/nodes`,
  `/api/v1/nodes/register`, `/api/v1/nodes/[nodeName]` dynamic route 포함).
  2026-06-27 continuation에서 owner-approved guarded path로 `desktop-latest` rc.21 assets를 publish하고,
  Vercel production deployment `dpl_E7TrT4SfZm2kEaVvnM4DpW43i9nj`를 `musu.pro`에 alias했다.
  같은 날 public fleet repair route follow-up으로 production deploy
  `dpl_3S5URjmeZomLD7c6zcffrNHrcSY2`가 최신 `musu.pro` alias가 됐다.
  `https://musu.pro/api/health`는 `musu.site_health.v1`, version `1.15.0-rc.21`로 200 OK.
- ✅ **2026-06-27 continuation 재검증**: 로컬 `node_modules/.bin` shims가 깨져 `tsx`/`next/server`
  resolution이 실패하던 환경 문제를 `npm install`로 복구(소스/lockfile tracked diff 없음). 이후
  `npx tsx --test src/app/api/health/route.test.ts src/lib/nodeRegistryStore.test.ts src/app/api/v1/nodes/register/route.test.ts src/app/public-metadata-contract.test.ts`
  38/38 통과, `npm run test:public-release` 11/11 통과, `git diff --check` 통과.
  추가 재확인에서 `cargo test registry_last_seen_to_heartbeat --lib` 1/1 통과.
  PR #34는 current branch lineage 기준 mergeable이고 code/test 계열 check는 통과, 남은 GitHub gate는
  `design-gate` 1개(실제 `Design: Approved` + design brief/artifact 필요, 임의 bypass 금지).
  GitHub issue #35는 open 상태이며 evidence refresh comment
  `https://github.com/yellowhama/musu-bee/issues/35#issuecomment-4813006122`는 있지만
  explicit approval comment는 아직 없다.
  live install-channel은 production follow-up 후 `ok=true`, `failure_count=0`:
  `https://musu.pro/api/health` 200 + `musu.site_health.v1`,
  `public-config releaseVersion=1.15.0-rc.21`,
  hosted `Install-MUSU.ps1` exposes `ExpectedReleaseVersion=1.15.0-rc.21`,
  hosted appinstaller/MainPackage `1.15.0.21`. 후속으로 `https://musu.pro/repair-fleet.ps1`
  public route도 추가되어 main PC에서 repo 없이 fleet URL repair/check를 실행할 수 있다.
- ✅ **design-gate 승인 준비물 생성(승인 아님)**: PR #34의 UI 변경 범위(`/download`,
  `/install`, `/fleet`, `/dashboard/fleet`)를 `docs/DESIGN_BRIEF_PR34_FLEET_INSTALL_2026_06_27.md`에
  정리했고, 로컬 dev server(`127.0.0.1:3000`)에서
  `docs/design-artifacts/pr34-download.png`, `pr34-install.png`, `pr34-fleet.png`를 캡처했다.
  이 패킷은 승인자가 판단할 수 있는 evidence일 뿐이며, design-gate 통과에는 별도 issue URL,
  explicit approval comment, PR body의 `Design: Approved`가 여전히 필요하다.
- ✅ **cloud stale row cleanup 경로 추가**: 신규 `DELETE /api/v1/nodes/[nodeName]` route와
  `deleteNodeByName(owner, nodeName)` store 함수. owner scope 안에서만 삭제하고, 같은 node_name을
  가진 다른 owner row는 삭제하지 않음. listNodes가 숨기는 legacy loopback row도 raw store에서 삭제 가능.
  Rust CLI와 설치된 rc.21 MSIX 모두에 `musu nodes --json --delete hugh-main` wrapper를 추가했으며
  JSON schema는 `musu.nodes_delete_cli.v1`이다(DELETE 호출은 production route deploy 후 유효).
  추가로 `musu nodes` 기본 출력은 remote-unusable cloud row를 fleet truth에서 제외하고,
  감사/정리 때만 `--include-unusable`로 명시 조회하도록 보강했다.
  신규 `scripts\windows\remove-cloud-node-registry-row.ps1 -NodeName hugh-main -Json`은 token을
  env/`~\.musu\token`에서 읽어 DELETE 호출 evidence(`musu.cloud_node_registry_delete.v1`)를 출력하며,
  옛 패키지/직접 CLI 접근이 어려운 환경의 cleanup fallback이다.
- ✅ **main 복구 절차를 스크립트화**: 신규
  `scripts\windows\repair-fleet-node-public-url.ps1`. installed WindowsApps alias 기준으로
  package identity 확인 → bridge restart(기본) 또는 `-NoRestart` 진단 → doctor advertised URL
  remote-usable 검증 → cloud node registration 검증 → `musu.fleet_node_public_url_repair.v1`
  evidence 출력. second에서 rc.21 재설치 후 기본 restart 실측 통과:
  `bridge_pid=14084`, `service_registry_bind_addr=0.0.0.0:7476`,
  `advertised_public_url=http://192.168.1.154:7476`,
  `cloud_public_url=http://192.168.1.154:7476`, `cloud_public_url_remote_usable=true`.
  public route `https://musu.pro/repair-fleet.ps1`는 같은 canonical script를
  `desktop-latest` release asset에서 proxy하므로, main PC에서는 repo 복사 없이
  `& ([scriptblock]::Create((irm https://musu.pro/repair-fleet.ps1))) -ExpectedNodeName hugh-main -Json`를 실행하면 된다.
- ✅ **brain ingest token ACL source hardening**: Tauri knowledge sidecar bootstrap은
  `~\.musu\brain\runtime\musu-ingest.token`을 Windows에서 쓰기 전에 `icacls /inheritance:r /grant:r <current-user>:F`로
  제한하고, 기존 token을 재사용할 때도 ACL을 다시 좁힌다. `verify-fleet-audit-contract.ps1`에는
  `-RequireBrainToken` gate가 추가되어 packaged first-run 이후 token 존재와 ACL을 강제 검증할 수 있다.
  현재 second runtime에는 token이 아직 없어 기본 fleet audit은 이 brain gate를 skip한다.
- ✅ **pasted audit 5건 회귀 verifier 추가**: 신규
  `scripts\windows\verify-fleet-audit-contract.ps1`. package identity, bridge health,
  `bridge.json` raw bind vs doctor bind, self advertised/cloud URL remote-usability,
  `online_nodes` direct-only, resolver cache loopback exclusion, `tls/key.pem` /
  `private_mesh.toml` ACL, remote cloud registry row를 한 번에 판정한다. 주의: 기본
  `musu nodes --json`은 unusable row를 숨기므로 verifier는 remote registry 감사에
  `musu nodes --json --include-unusable`을 사용한다.
  rc.21 second 실측: production follow-up 전에는 `-AllowRemoteRegistryWarnings -Json`이
  `warn_count=1`(`hugh-main=http://127.0.0.1:13397`)였으나, `musu.pro` deploy 후 현재 strict
  `-Json`은 `ok=true`, `warn_count=0`, `remote_cloud_warning_count=0`.

## ⚠️ 미해결 / 다음 행동
1. 🟡 **hugh-main 물리 머신 검증은 아직 별도**: production registry stale loopback row는 더 이상
   현재 warning으로 남지 않는다. `verify-fleet-audit-contract.ps1 -AllowRemoteRegistryWarnings -Json`
   실측은 `ok=true`, `warn_count=0`, `remote_cloud_warning_count=0`,
   `online_nodes=1`, `direct_healthy_nodes=1`. 다만 main PC 자체가 실제로 켜져 있고
   작업 수신 가능한지는 main에서 rc.21 설치/재시작 후 확인해야 한다. main에서 실행할 검증/복구 절차:
   `& ([scriptblock]::Create((irm https://musu.pro/repair-fleet.ps1))) -ExpectedNodeName hugh-main -Json`.
   통과 조건: `advertised_public_url_remote_usable=true`,
   `cloud_public_url_remote_usable=true`, `cloud_public_url`이 `127.0.0.1`이 아님.
2. ✅ **musu.pro production install channel 배포 완료**:
   guarded publisher로 `desktop-latest` rc.21 assets를 업로드했고 canary가 `ok=true`, `failure_count=0`.
   Vercel remote build deploy `dpl_3S5URjmeZomLD7c6zcffrNHrcSY2`가 최신 `https://musu.pro` alias임.
   `verify-musu-pro-install-channel.ps1 -Json`은 `ok=true`, `failure_count=0`;
   `/api/health`는 200 `musu.site_health.v1` + `1.15.0-rc.21`,
   `/api/public-config`는 `releaseVersion=1.15.0-rc.21`,
   `/install.ps1`는 `ExpectedReleaseVersion=1.15.0-rc.21`와 cert thumbprint를 노출하며,
   `/repair-fleet.ps1`는 HTTP 200, length 7195, `musu.fleet_node_public_url_repair.v1`,
   `ExpectedNodeName`을 노출한다.
3. 🔴 **PR #34 merge gate**: GitHub code/test/deploy checks는 통과했지만 `design-gate`는 계속 실패.
   실제 `Design: Approved` + design brief/artifact 없이는 merge하지 않는다.
4. 🟡 **W-4 relay-fallback flip 잔여**: main이 다시 reachable해진 뒤, LAN bind 차단으로 direct 실패 유도
   → 노랑 "relay" 표시(display-only, `online_nodes`/targetable 제외) → heartbeat 만료 → offline 3-state 전이
   검증(플레이북 `E2E_FLEET_3STATE_PLAYBOOK_2026_06_23.md`).
5. 🟡 **brain first-run evidence 잔여**: 새 build/package를 실행해 `~\.musu\brain\runtime\musu-ingest.token`이
   생성되는지 확인한 뒤 `verify-fleet-audit-contract.ps1 -RequireBrainToken -Json`을 통과시켜야
   brain bonding을 release-grade로 부를 수 있다.
6. 🟡 **DPAPI at-rest retroactive 갭(신규 발견 2026-06-26)**: V31 bearer ensure는 **값이 다를 때만**
   `write_mesh_bearer`를 부른다(compare-then-write, watcher churn 회피 — 의도된 설계). 따라서 **이미
   올바른 평문 bearer를 가진 기존 머신은 영영 평문**으로 남고 DPAPI 암호화가 retroactive 적용 안 됨.
   실측: 이 머신 mesh.env = `MUSU_MESH_BEARER=ec597d…`(평문, DPAPI 키 없음)인데 bearer는 정상 동작.
   **이건 버그 아님 — 재설치/재join/서버 rotate 시에만 DPAPI write 발생(=새 머신은 항상 DPAPI).**
   기존 머신 retroactive hardening이 필요하면 별도 후속(예: ensure가 평문 키 감지 시 1회 강제 재write,
   또는 `musu mesh reseal` 커맨드). 다음 에이전트는 "평문=버그"로 오진 말 것.
7. 🟢 **SmartScreen vs cert 구분**: unsigned NSIS .exe는 SmartScreen "알 수 없는 게시자" 경고(cert
   신뢰로 안 풀림 — Authenticode/평판 필요). "베타 cert" 에러(MSIX 전용)와 혼동 주의. GA에 EV/Store.
8. 🟢 **V32 닫힘**: NSIS .exe는 일반 Win32라 cert 무관 — "NSIS에 cert 박기"는 헛수고로 판정(Researcher).
9. 🟡 **brain bonding release-grade proof 필요**: sidecar 번들/버전 pin/lifecycle/task ingest 코드는 1차
   구현됐지만, packaged MSIX first-run에서 `~/.musu/brain` 생성, token ACL, loopback health, 실제
   source ingest evidence를 아직 못 닫았다. Go brain chip semver surface도 아직 없어 pin+VCS gate로
   대체 중이다.

## 검증 방법 (무당짓 금지)
- source tests: `cargo test --lib bridge::tests`, `cargo test --lib bridge::handlers::fleet`,
  `cargo test --lib install::cli_commands`, `cargo test --lib install::tls`,
  `cargo test --lib install::private_mesh`, `cargo test --lib`,
  `npx tsx --test src/lib/nodeRegistryStore.test.ts src/app/api/v1/nodes/register/route.test.ts`,
  `npm run typecheck`, `npm run build`.
- PowerShell parser: `remove-cloud-node-registry-row.ps1`, `repair-fleet-node-public-url.ps1`,
  `verify-fleet-audit-contract.ps1`.
- package tests: `verify-msix-package.ps1 -Configuration release -StartupContract local-sideload-manual`,
  `install-and-verify-msix.ps1 -StartupContract local-sideload-manual -ReplaceExisting`.
- node repair: `repair-fleet-node-public-url.ps1 -NoRestart -Json` on an already-healthy node,
  or without `-NoRestart` on the affected node after install/reinstall.
- audit verifier: `verify-fleet-audit-contract.ps1 -AllowRemoteRegistryWarnings -Json` may pass
  with `warn_count=1` before production cleanup if only remote stale rows remain. Strict
  `verify-fleet-audit-contract.ps1 -Json` must pass after main republishes a non-loopback URL
  and/or `musu.pro` production list filtering is deployed.
  `verify-fleet-audit-contract.ps1 -SelfTestRemoteUsable -Json` must stay green for loopback,
  wildcard, IPv6 loopback, and IPv4-mapped loopback/wildcard cases.
- desktop-latest canary: after uploading rc.21 release assets, run
  `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\canary-desktop-release.ps1 -Json`.
  It must return `schema=musu.desktop_release_canary.v6`, `ok=true`,
  `expected_package_version=1.15.0.21`, hosted appinstaller versions matching, hosted installer
  release/cert pin matching, hosted installer/uninstaller/repair hashes matching, hosted repair schema/guard matching,
  hosted cert thumbprint matching, and remote/local `musu-desktop-x64.msix` plus setup exe lengths matching.
- installer release canary: run
  `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\Install-MUSU.ps1 -ValidateReleaseOnly`.
  It must print `MUSU release channel validation passed.` before any main-PC install command is given to a user.
- remote installer release canary: run
  `powershell -NoProfile -ExecutionPolicy Bypass -Command "& ([scriptblock]::Create((Invoke-WebRequest -UseBasicParsing https://musu.pro/install.ps1).Content)) -ValidateReleaseOnly"`.
  It must print the same success line through the exact hosted `irm/iex` path.
- live second: WindowsApps alias `musu doctor --json` must show `distribution=store-msix`,
  `bridge.service_registry_bind_addr=0.0.0.0:<ephemeral-port>`,
  `bridge.advertised_public_url=http://192.168.1.154:<same-port>`, and account warning for
  `hugh-main: cloud public_url points to loopback/wildcard`.
- live fleet: `musu status --json` must show `hugh_second healthy/direct`, `hugh-main offline`,
  `total_nodes=2`, `online_nodes=1` until main republishes a non-loopback URL.
- live cloud list: `musu nodes --json` must hide remote-unusable rows under
  `filtered_unusable_nodes`; `musu nodes --json --include-unusable` is the explicit audit view.
- brain bonding: `cargo test --manifest-path musu-rs\Cargo.toml --jobs 1 --lib
  writer::runner::tests::knowledge_task_source_uses_scoped_markdown_payload`;
  `cargo test --manifest-path musu-bee\src-tauri\Cargo.toml --jobs 1 --lib
  tauri_bundle_config_includes_runtime_sidecar`;
  `cargo test --manifest-path musu-bee\src-tauri\Cargo.toml --jobs 1 --lib
  parses_knowledge_auth_token_without_logging_context`; packaged proof still required.

## 참고 문서/메모리
- 마스터: `V29_RESIDUAL_MASTER_PLAN` / `V30_FLEET_DYNAMIC_ADDR_MASTER_PLAN` / `V31_MESH_BEARER_AUTORECONCILE_MASTER_PLAN` (전부 2026-06-25).
- closure HTML: `CLOSURE_V29_RESIDUAL` / `CLOSURE_V30_FLEET_DYNAMIC_ADDR`.
- 메모리: `reference-musu-fleet-registry-authority`, `reference-musu-bearer-autoreconcile-toast-osmanaged`,
  `feedback-reword-update-pinned-tests`(reword 시 pin 테스트 동반 갱신).
- thesis(사용자 확정): **느슨한 연합** — 각 PC 서버화 + musu.pro 레지스트리로 하나처럼, 중앙 단일홈서버 X.
- thesis(사용자 확정): `BRAIN_INTEGRATION_THESIS_2026_06_26.md` — `musu-brain`은 Go chip 그대로,
  `musu`가 메인보드로 묶는 완제품 1대. loose MCP 부품 판매가 아니라 hidden product bonding.
