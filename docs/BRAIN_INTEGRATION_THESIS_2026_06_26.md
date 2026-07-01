# musu-brain 통합 Thesis — 완제품 1대 ("메인보드 + 칩") (2026-06-26)

> Phase -1 전략게이트(business-panel 4인 debate, 🟡 YELLOW) + Phase 0 리서치 2건(코드 실측 + 데스크탑
> 패턴) + 사용자 결정. 2026-06-26 codex가 진행 중인 `musu-bee` fleet 작업에 **1차 bonding 구현**을
> 합류시켰다. 이 문서는 이제 "착수 전 thesis"가 아니라 **제품 스펙 + 구현 상태 기준 문서**다.
>
> **기존 문서와의 관계 (중복 아님):**
> - `SINGLE_BINARY_INTEGRATION_PLAN_2026_06_11.md` — musu **내부** 3-exe(desktop/runtime/startup) 통합.
>   여기서 발견한 **결정적 platform 제약**(Windows subsystem이 link-time 고정 → 한 exe가 clean CLI +
>   flash-free GUI 동시 불가)이 이 thesis를 **강화**한다: brain도 "칩으로 사다 꽂되 녹이지 않는" 게 정답.
> - `RESEARCH_3LAYER_AND_HTML_WIKI_MEMORY_2026_05_18.md` (wiki/456) — 3-layer 감사. "wiki 60% 완성,
>   markdown 영구지식까지 와있음". 이 thesis는 그 영구기억 vision의 **brain(단계3 지식레이어) 통합 방식**을 확정.

## 사용자 결정 (verbatim, /goal)
> "한 케이스에 부품 조립 (각 칩은 그대로, 메인보드가 묶음) ← brain은 Go 바이너리 그대로, musu가
> 메인보드처럼 데이터·lifecycle·UX를 묶음. 합친 제품 1대."

직전 핵심 반문:
> "컴퓨터를 파는데 cpu gpu 램 하드를 따로 팔아서 연결파트를 궂이궂이 따로 다 팔고 니가 합치세요
> 라고 하는거랑 지금 뭐가 다르냐?"

→ **부품 따로 팔지 않는다. 완제품 1대로 조립한다.** "사이드카로 옆에 두고 MCP로 호출하세요"는
부품을 한 박스에 넣고 케이블은 사용자가 꽂으라는 것 = 미완성. 거부. (패널의 "느슨한 MCP 결합"
권고를 사용자가 명시적으로 거부 — 단계3 지식레이어는 외장 메모리가 아니라 musu의 뇌.)

## Thesis (확정)
**musu가 메인보드, brain은 사다 꽂는 칩.** brain(Go single-binary 21.5MB)을 **코드 변경 없이** musu
제품의 일부로 조립한다. 사용자는 "brain"이 있는지도 모른다 — 그냥 musu가 똑똑하다. 컴퓨터 제조사가
칩을 직접 안 만들고 사다 메인보드에 조립하듯, brain은 그대로 두고 musu가 묶는다.

**"한 케이스 조립"이고 "SoC 재설계"가 아닌 이유 (2중 근거):**
1. brain Go→Rust 재작성 = 39k LOC 칩 재설계. no-YAGNI 정면 위반.
2. **Windows platform 제약** (`SINGLE_BINARY_INTEGRATION_PLAN` 검증): subsystem이 link-time 고정이라
   한 exe가 clean CLI(stdout) + flash-free GUI를 동시에 못 한다. 즉 "다 녹인 단일 exe"는 Windows에서
   **물리적으로 불가**. 칩은 별 바이너리로 두는 게 설계가 아니라 platform 한계의 귀결.

## 메인보드가 묶는 3가지 (실측 근거)

### 1. 데이터 (한 메모리)
- brain store를 **`~/.musu/brain`** 에 둔다 (현 `~/.musu-brain` → musu와 같은 유저 프로필 루트).
  - H3 안전: `~/.musu`는 유저 프로필 = **MSIX LocalState 밖**. reconcile이 user data 안 건드림
    (`musu-rs install/reconcile.rs:12-14`). MSIX 업데이트·재설치 생존. LocalState는 uninstall 삭제 위험 → 금지.
- musu가 task/지식을 brain 검색 뇌로 흘림: 2026-06-26 1차 구현은 task 완료 hook
  (`musu-rs/src/writer/runner.rs::finalize`)에서 `POST /v1/sources`로 markdown source를 비동기 ingest한다.
  fleet 이벤트 ingest는 아직 별도 후속이다. bridge `/brain/*` 프록시 **이미 존재**
  (`musu-rs bridge/handlers/proxy.rs:100-108`).
- **정직한 한계**: musu.db(STRICT 스키마/FK/audit)와 brain(markdown 트리 SSOT)은 형식이 달라 **물리적
  "단일 원본"은 불가** — brain엔 사본이 들어간다. 사용자 경험상 "한 메모리"(recall·검색이 brain 하나)는
  달성되나, 단일 원본은 아님. 무결성 잃으며 강제하지 않는다.

### 2. Lifecycle (같이 살고 죽는다)
- Tauri가 brain을 **사이드카로 spawn/감독**. 데몬 아님 — cockpit 생사에 종속.
  - 2026-06-26 1차 구현: `src-tauri/tauri.conf.json` externalBin에 `binaries/musu-brain` 추가,
    `scripts/build-tauri-sidecars.mjs`가 `F:\musu_2nd_brain`의 Go binary를 target triple suffix로 굽는다.
  - Tauri가 `~/.musu/brain`를 단일 root로 결정하고, `musu-brain init/auth issue/server`를 통해 workspace와
    ingest token file을 준비한 뒤 `127.0.0.1:8080` loopback으로 띄운다. Runtime bridge에는
    `MUSU_KNOWLEDGE_*` env를 주입한다.

### 3. UX (같은 cockpit)
- recall(질의)·capture(저장)를 cockpit 안에서. 사용자는 brain을 별개 도구로 인식 안 함. 기존 3존 레이아웃 위.

## 조립에 필요한 신규 본딩 (2026-06-26 상태)
✅ Tauri 사이드카 슬롯 · ✅ MSIX 멀티-exe 스테이징 · ✅ bridge `/brain/*` 프록시

✅ **신규1 — 버전 coherence 게이트에 brain 추가**:
`src-tauri/musu-brain.pin.json`을 추가하고 `build-msix.ps1::Assert-VersionSourcesCoherent`가
brain pin의 `product_version`을 5번째 버전 소스로 검사한다. `build-tauri-sidecars.mjs`와
`build-msix.ps1`는 Go build info의 `vcs.revision`/`vcs.modified=false`를 pin과 대조한다.
정직한 한계: Go brain chip 자체가 product semver를 노출하지 않아 현재는 **native brain --version gate가 아니라
pin+VCS gate**다. brain이 semver surface를 제공하면 이 게이트를 더 강하게 만들 수 있다.

✅ **신규2 — sidecar bundle + `~/.musu/brain` + task ingest 배선**:
Tauri externalBin, sidecar build, MSIX stage copy, loopback autostart, workspace/token bootstrap,
runtime env 주입, `writer::runner::finalize`의 non-blocking `POST /v1/sources`까지 1차 배선됐다.
fleet 이벤트 ingest와 cockpit recall/capture UX는 후속이다.

✅ **신규3 — "brain" 네이밍 충돌 해소**:
Go 지식엔진 통합 코드는 `knowledge_*` env/function/test 이름으로 배치했다.
기존 `musu-rs/src/brain/*` 태스크 오케스트레이터(:8888)는 건드리지 않는다.

## Scope 울타리 (no-YAGNI)
- ❌ brain Go→Rust 재작성 (SoC 재설계; Windows subsystem 제약상 단일 exe도 불가)
- ❌ 공유 SQLite 동시 쓰기 (Go modernc + Rust C-sqlite 동시 writer 검증비용 큼 — owner 1개 + IPC 정석)
- ❌ brain HTTP :8080 결합면 노출 (프록시만)
- ❌ 데이터를 LocalState로 이동 (H3 손실 tail)
- ✅ 사이드카 번들 + `~/.musu/brain` + ingest 배선 + 버전게이트 + UX 표면만

## §0 Phase -1 전략게이트 (이월)
business-panel 4인 debate 🟡 YELLOW → 사용자가 "데이터 통합(하나의 뇌)"로 reshape, 패널의 "느슨한
MCP 분리" 거부. 리서치가 "단일 owner + IPC + 같은 유저프로필 루트"로 그 의도를 실현 가능하게 정합.

| # | Expert | Sev | Claim | Resolution |
|---|--------|-----|-------|-----------|
| H1 | Porter | HIGH | "한 바이너리"는 3결정(바이너리/lifecycle/데이터위치) 숨김 | 3개 분리, 데이터는 `~/.musu/brain` 단일위치로 통합 |
| H2 | Taleb | HIGH | 버전 게이트가 brain 제외 = 드리프트 무가드 | brain 버전 추가 = 출시 하드 선결조건(신규1) |
| H3 | Taleb | HIGH | 데이터 손실 tail | `~/.musu/brain`(LocalState 밖) = 업데이트·재설치 생존. V34 자가치유와 정합 |
| H4 | Drucker | HIGH | scope creep(지식엔진을 제품 기둥으로) | brain 코드 그대로(칩), musu가 묶음(메인보드). HTTP:8080 미노출 |
| M3 | — | MED | "brain" 네이밍 충돌(:8888 태스크 brain) | knowledge/recall 네임스페이스(신규3) |

## 다음 행동
1. 1차 bonding 검증: target tests, `build-tauri-sidecars.mjs`, MSIX build/stage, installed package first-run에서
   `~/.musu/brain` 생성 + token file + loopback `/health` + task ingest source 생성까지 증명한다.
2. token file ACL hardening은 source/verifier 배선됨. 현재 token은
   `~/.musu/brain/runtime/musu-ingest.token`에 저장되며 값은 로그에 남기지 않는다. Tauri는 token을
   쓰기 전 Windows ACL을 current-user only로 제한하고, 기존 token 재사용 때도 ACL을 다시 좁힌다.
   packaged first-run 후 `verify-fleet-audit-contract.ps1 -RequireBrainToken -Json`으로 token 존재와
   ACL을 hard gate로 검증한다.
3. cockpit recall/capture UX와 fleet event ingest를 단계 3 지식레이어 마스터 플랜으로 분리한다.
4. brain chip이 semver를 직접 노출하면 pin+VCS 게이트를 native product version gate로 승격한다.

## 2026-06-27 rc.22 상태

- Hosted install channel은 `1.15.0-rc.22` / `MSIX 1.15.0.22`로 올라갔고, 이 패키지에는
  brain ingest token ACL hardening이 포함된다.
- `musu-brain.pin.json`은 clean `F:\musu_2nd_brain` HEAD
  `2f036728a9e6d5840634666d7442be87d302f083`를 가리킨다. 첫 rc.22 full build는 옛 pin
  `f7678af71d281a10df64c79e4eda6bc77ef8a719`와 HEAD 불일치 때문에 실패했고, pin gate가
  의도대로 fail-closed 동작했다.
- `desktop-latest` GitHub asset은 fixed filename만으로는 `--clobber` 직후 stale rc.21 content를
  반환할 수 있어, public release URL과 generated appinstaller URI에 `?rc=1.15.0.22`를 붙이는
  cache-busted release contract로 보강했다.
- 아직 release-grade brain proof는 아니다. `verify-fleet-audit-contract.ps1 -RequireBrainToken -Json`은
  packaged first-run이 `~/.musu/brain/runtime/musu-ingest.token`을 만든 뒤 통과해야 한다.

## 2026-06-30 handoff + package refresh 상태

- brain repo canonical handoff:
  `F:\musu_2nd_brain\docs\HANDOFF-musu-integration.md`.
- brain repo `main` is clean and pushed at
  `88a3df5 docs: handoff for musu integration (what musu-brain is, how it was built, how to integrate)`.
- Current package pin:
  `musu-bee/src-tauri/musu-brain.pin.json` points to clean brain commit
  `c477c004691a7fe5d555e4403d91bab71a3c303f` with
  `vcs_time=2026-06-30T22:39:03+09:00`.
- Current HUGH_SECOND packaged evidence verifies the hidden brain sidecar
  contract as part of the local package proof, including restricted
  `runtime/musu-ingest.token` ACL through the fleet proof path.

### Handoff 내용 중 즉시 반영해야 할 안전 규칙

- brain은 계속 Go single-binary chip이다. Go 코드는 제품 통합 때문에
  rewrite하지 않는다.
- 사용자에게 brain을 별도 제품처럼 노출하지 않는다. MUSU가 data,
  lifecycle, UX를 묶는 motherboard다.
- MCP 등록은 `print-config`가 먼저다. 자동 편집보다 print-don't-write와
  사용자 확인을 우선한다.
- user notes는 push 금지다. 제품/유저 데이터 분리는 유지한다.
- LocalState는 brain data root로 쓰지 않는다. 업데이트/재설치 생존성이
  필요한 사용자 프로필 루트만 허용한다.

### 2026-07-01 data-root 계약 정리

최신 brain handoff는 standalone brain 기본 레이아웃을 `~/.musubrain`
계열로 설명한다. MUSU 제품에서는 그 기본값을 쓰지 않는다.

정식 제품 계약:

1. MUSU가 단일 resolver/env contract를 소유한다.
2. MUSU product root는 계속 `~/.musu/brain`이다.
3. Tauri sidecar는 `musu-brain server -root <~/.musu/brain>`로 시작한다.
4. Tauri는 runtime child와 brain sidecar에 `MUSU_KNOWLEDGE_ROOT`와
   `MUSUBRAIN_ROOT`를 같은 `~/.musu/brain` 값으로 주입한다.
5. proof scripts는 `~/.musu/brain`과 MSIX LocalState 금지를 계속 hard
   gate로 본다.

이로써 root split은 source-level로 정리됐다. 단, 이 변경은 현재 설치된
package evidence 이후의 source change라서 다음 release claim에는 재빌드,
재설치, brain product proof 재캡처가 필요하다.

관련 문서: `BRAIN_INTEGRATION_ROOT_CONTRACT_2026_07_01.md`.

### 2026-07-01 MSIX fullTrustProcess 패키지 계약

`~/.musu/brain` root-env 계약을 재빌드/재설치해서 검증하는 과정에서
중요한 Windows 패키징 계약이 추가로 확정됐다. `musu-brain.exe`를
MSIX 안에 복사하고 Tauri `externalBin`에 올리는 것만으로는 충분하지
않다. 설치된 패키지의 AppxManifest가 `musu-brain.exe`를
`windows.fullTrustProcess`로 선언해야 숨은 brain sidecar가 실제로
실행된다.

확정된 제품 계약:

1. `musu-brain.exe`는 MSIX에 포함된다.
2. AppxManifest는 `musu-brain.exe`의 `windows.fullTrustProcess` 선언을
   포함한다.
3. package verifier와 installed-package verifier는 둘 중 하나라도 빠지면
   실패한다.
4. `capture-msix-install-evidence.ps1`와
   `verify-msix-install-evidence.ps1`는 `brain_full_trust_process=true`를
   release evidence 계약으로 본다.
5. proof는 `~/.musu/brain`, loopback `127.0.0.1:8080`, sidecar process,
   token ACL, ingest/recall까지 같이 본다.

현재 `HUGH_SECOND` 로컬 sideload package evidence는 이 계약을 통과한다.
정식 정리 문서:
`CURRENT_PACKAGED_BRAIN_MSIX_AUDIT_2026_07_01.md`.

관련 메모리: [[musubrain-지식엔진]] [[decision-musu-3tier-thesis]] [[decision-musu-v28-fleet-as-one-device]]
[[feedback-no-yagni-architecture]] [[feedback-self-contained-product]] [[reference-musubrain-stableid-overwrite]].
관련 문서: `SINGLE_BINARY_INTEGRATION_PLAN_2026_06_11.md`, `RESEARCH_3LAYER_AND_HTML_WIKI_MEMORY_2026_05_18.md`(wiki/456).
