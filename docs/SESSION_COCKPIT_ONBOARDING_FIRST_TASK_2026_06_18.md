# Session: cockpit 첫 경험 = 첫 작업 최단거리 + aha (2026-06-18)

**Branch:** `feature/onboarding-first-task` → **main 머지 완료** (`2425bedb`, pushed)
**Commits:** `5f3f9fec`(빈 상태 재프레임 + 칩 + aha), `1c3d9b53`(connector-policy 접기)
**Status:** 구현 + 테스트(48/48) + Phase-5 독립 audit(0 HIGH) + 시각 검증 완료. 머지됨.
**Scope:** cockpit Tauri shell UI 단일 도메인 (`musu-bee/src-tauri-shell/` 4 파일). auth/schema/secret/cross-repo 무관.

## 문제 (왜 이 작업을 했나)

onboarding flow 영상 리서치(1000+ 분석)의 핵심 두 가지: **value까지 최단거리** + **aha moment를 의도적으로 디자인**. 무수의 aha = "기계에 일 시키고 자리 비우면 알림 옴"(walk-away → pinged 루프).

**코드 실측으로 잡은 가장 큰 결함 (`src-tauri-shell`):**
- 첫 로그인 후 빈 상태(`#fleet-empty`, "This is your only machine" + Add PC 유도)가 뜨고 **Add PC Panel이 자동 오픈**(`main.js` `setAddPcPanelOpen(isEmpty)`). Add PC = Headscale 인프라 설정 = 복잡. **사용자를 aha(첫 작업)가 아니라 인프라 설정으로 떠민다** — 영상 "get out of the way" 정반대.
- 진짜 aha("이 PC에 일 시키기")는 기계 추가 없이 지금 가능한데 UI가 안 가리킨다.
- 첫 작업 done 시 task card 상태만 바뀜(축하/aha 터치 없음).

## 설계 결정 (3옵션 SWOT)

| 옵션 | 내용 | 판정 |
|------|------|------|
| 1 (채택) | cwd 무관 칩 + 루프 체감, 변경 작음 | ✅ H3(cwd 회피)+H4(루프 체감) 둘 다 풀며 nudge 유지 |
| 2 | cwd 먼저 고치고 폴더-상대 칩 | ❌ 스코프 크리프 (Rust+cockpit cwd 리팩터로 번짐, heavy-architecture 경계 위반) |
| 3 | 칩 전부 제거 | ❌ 영상 핵심 nudge 포기, 후퇴 |

frontend-architect Critic가 HIGH 4건. 모두 옵션1 구현에 반영(아래 "Critic HIGH 해소").

## 구현 (파일별)

### A. 빈 상태 재프레임 (`main.js` renderFleet, `index.html` #fleet-empty)
- `setAddPcPanelOpen(isEmpty)` → `setAddPcPanelOpen(false)` (자동오픈 중단). user 토글/`#empty-add-pc` 경로 불변(`addPcPanelUserToggled` latch).
- `#fleet-empty` 재작성: title "This PC is connected and ready." / sub "Give it a task below — then walk away. MUSU notifies you when it's done." / **primary CTA `#empty-give-task` → `focusOrderInput()`** / Add PC는 하단 secondary `btn-link` "Add another PC (optional)".
- order-input placeholder → "What should this PC do?".
- **connector-policy 접기**: 빈 fleet & !firstTaskDone 일 때 `#connector-policy` hidden — empty 상태와 order box 사이에 끼어 첫 작업을 fold 아래로 밀던 섹션을 첫 화면에서 숨김.

### B. 예시 명령 칩 (`index.html` #order-examples, `main.js`)
- 칩 2개 `<button type="button" data-order-example>`. 클릭 → 입력란 **채우기만**(전송 X) + `focusOrderInput()`. delegated 핸들러.
- 첫 작업 전까지만 노출(`updateOrderExamplesVisibility` — firstTaskDone 시 hidden).
- **문구 = cwd 무관 + 정직(읽기/추론, headless 보장)**: "Introduce yourself and list what you can help me do on this machine…" / "Write me a short status report on this machine…". cwd 의존("this folder") 금지, exec/mutate형 제외.

### C. 첫 작업 aha 1회 (`main.js` notifyTerminal done 분기)
- 상태: `localStorage["musu.onboarding.firstTaskDone"]` (machine-scoped v1, try/catch 가드).
- `markFirstTaskDoneIfNeeded()` — 순수+멱등. notifyTerminal `status==="done"` 첫 발생 시 1회: 한 줄 배지 `#first-task-aha`(dot pulse 1회) + `announce()`. **모달/컨페티 금지.**
- 같은 분기에서 **Add PC contextual nudge** `#aha-add-pc`(M1) — 단일-PC value 체감 직후 = 확장 유도 최적 타이밍.

### 스타일 (`styles.css`)
- `.btn-link`, `.empty-secondary`, `.order-examples/.order-example`(muted, order-box와 경쟁 안 함), `.first-task-aha/.aha-dot`(pulse, `prefers-reduced-motion` 존중).

## 검증

### 단위 (cockpit-contract.test.ts: tsx --test, JSDOM + win.eval(main.js))
- **48/48 pass** (기존 43 + 신규 5). 머지 후 main에서도 48/48 재확인.
- 신규 5: 자동오픈 제거(계약 변경), CTA 클릭→order-input focus, 칩 채우기-not-send(`invoke("submit_order")` 0회), aha 1회 멱등, placeholder.
- 비동기 가드: main.js가 load 시 refresh() 호출 → 테스트 async + `await setTimeout(0)` flush 후 `dom.window.close()`.

### 시각 (browse, 정적 file:// 렌더, viewport 1280×800)
- **H2 실재 확인**: 수정 전 order-box top=876 > 800px fold → 보이지 않음.
- CTA `scrollIntoView` 동작: order-input top=619(보임), focused=true.
- **시각 검증으로 발견한 추가 결함**: connector-policy 섹션이 #fleet-empty와 order-box 사이에 끼어 order box를 fold 아래로 밂 → 빈 fleet일 때 접기(`1c3d9b53`). 재검증: order-box top=581 < 720 = 스크롤 불필요. 스크린샷 깔끔.

### Phase-5 독립 audit (quality-engineer, 적대적)
- **HIGH 0건. 머지 안전.** 4개 Critic HIGH 코드 레벨 확인:
  - **H2 (fold 가시성): RESOLVED** — `focusOrderInput` scrollIntoView+focus + connector-policy 접기.
  - **H3 (cwd 의존 칩 금지): RESOLVED** — 두 칩 모두 cwd 무관, 읽기/추론, headless 정직.
  - **H4 (단일-PC aha 약함): PARTIAL → MEDIUM 잔여** — aha 배지+nudge는 정상 ship, 그러나 두 칩 모두 20-60s 안 걸릴 수 있어 walk-away 루프가 *체감* 안 될 수 있음. plan 자체가 deferred한 open-question. **dogfood 후속**(머지 블로커 아님).
  - **M1 (Add-PC 부활): RESOLVED** — empty secondary link + post-aha nudge 2경로.
- audit가 clean 확인(INFO): 멱등 + null-safe + localStorage 가드, 모든 element ID 존재(dead listener 0), 수동 Add-PC 토글 회귀 없음.

## 정성적 평가

**개선된 것:**
- 첫 화면이 "인프라 설정"이 아니라 "일 시키기"를 가리킨다 — 영상 "get out of the way" / "shortest path to value" 충족.
- aha를 task 내용이 아니라 *루프 메커닉*(위임→알림)으로 디자인 — 무수의 진짜 차별점을 첫 경험에 노출.
- M1: 단일-PC value 체감 직후 멀티-PC(무수 moat) 유도 — 타이밍 최적.
- 변경이 작고(4 파일, +321/-10), 가역적, blast radius 없음.

**정직한 한계:**
- **H4 잔여 (MEDIUM)**: 칩이 즉답이면 walk-away 루프 체감 약함. 실측(dogfood) 후 한 칩을 진짜 시간 걸리는 read/reason으로 교체 검토. 코드 결함 아니라 UX 튜닝.
- **검증은 정적 file:// 렌더 + JSDOM**: 실제 Tauri 빌드 앱의 IPC 흐름(실 로그인→fleet→submit)은 미실측. 픽셀 레이아웃은 1280×800만 확인, 타 해상도 미확인.
- **사용자 설치본 반영 = 데스크탑 재빌드 필요**: cockpit 변경이 설치된 MSIX에 들어가려면 Tauri 재빌드 + 재배포 체인 필요(앞 세션과 동일). 현재는 코드/main 머지까지만.
- connector-policy re-show가 첫 작업 후 최대 ~15s 지연(다음 poll까지) — 영구 숨김 아님, 비치명.

## 후속 처리 (audit follow-up, 2026-06-18 같은 날)

`feature/onboarding-followups` → main 머지(`386fb94e`).

- **H4 dogfood 완료 (항목 1)**: 두 칩의 실제 응답 시간을 headless `claude -p --model sonnet`로 측정.
  - 칩2 "status report" = **~28s** (20-60s walk-away 루프 체감 band 충족 ✅)
  - 칩1 "introduce yourself" = **~16s** (빠른 즉답 — 의도된 역할)
  - audit 기준 "**≥1 칩 20-60s**" 충족 → **칩 교체 불필요**, as-is 유지.
  - 칩1을 "look around this machine + 3가지 제안"으로 보강 시도했으나 cwd 깊이 탐색으로 **~3.5분(208s) 과교정** → 철회. 빠른 칩 1 + 루프 체감 칩 1 조합이 다양성에 낫다.
- **항목 3 완료**: `markFirstTaskDoneIfNeeded`가 connector-policy를 즉시 re-show(다음 ~15s poll 안 기다림). 칩→Send positive-control 테스트 추가(fill-not-send는 *부재*만 단언하므로 send 경로를 별도로 보호). **테스트 49/49**.

## 데스크탑 재빌드 + 배포 완료 (항목 2, 2026-06-18 같은 날)

사용자 승인 "MSIX 빌드 + musu.pro 배포까지". **묶음 결정 해소**: auto-mesh-join은 이미 main에 머지돼 있었음(`2d051cd9` 포함, route+lib 실재) → cockpit onboarding + mesh를 **같은 트리에서 함께 빌드**.

**빌드 체인** (`scripts/windows/build-msix.ps1`, self-contained — publisher=blossompark.musu 하드코딩, Yellowhama placeholder 이미 해소):
1. `cargo build --bin musu --bin musu-startup --release` (1m37s)
2. `tauri build --no-bundle` (beforeBuild = shell→out + sidecar 복사 → musu-desktop.exe 컴파일 5m13s)
3. `winapp pack` + canonical 키(`.local-build/signing/blossompark.musu.pfx`, 6/15 재사용 → auto-update 안정) 서명
4. `.appinstaller`(Version 1.15.0.0) + hosted-named msix copy 생성

**배포** (GitHub release `desktop-latest`, yellowhama/musu-bee, MANUAL `gh release upload --clobber`):
- `musu-desktop-x64.msix` 27.78MB (06:58 UTC) — 서명 Valid
- `musu.appinstaller` 1.15.0.0 (06:58) — auto-update primary
- `MUSU_1.15.0_x64-setup.exe` 215.1MB (07:05) — **재빌드 필요했음**(아래 함정)
- cert(6/14) + Install-MUSU.ps1(6/16) 불변 = 정합 유지

**라이브 검증**: 3 경로 HTTP 200 + 크기 정합. cert thumbprint 정합 확인 — MSIX 서명 = Install-MUSU.ps1 pin = `65F5926444D563966C75F000C384C8530B1D8DD8` (canonical 키 재사용 효과). install.ps1→cert trust→appinstaller 체인 무결.

**작업 중 잡은 함정 (정직)**: 첫 MSIX 빌드 후 다운로드 페이지가 노출하는 `setup.exe`(NSIS)가 **onboarding 6시간 전(09:46) stale 빌드**임을 발견 — msix만 최신이고 setup.exe는 옛 cockpit. `--no-bundle`은 NSIS를 안 만들기 때문. → `tauri build --bundles nsis`로 재빌드(16:04, onboarding 포함) 후 재업로드. 세 설치 경로(msix/appinstaller/setup.exe)를 모두 같은 빌드로 정합화.

### 배포 무결성 Audit (quality-engineer, 독립·read-only)

**Verdict: 라이브 배포 안전. HIGH/MEDIUM 0건.**
- publisher / identity / version / hosted-filename / cert-thumbprint **전 체인 정합** — MSIX manifest ↔ .appinstaller ↔ publicRelease.ts ↔ Install-MUSU.ps1 모두 일치.
- hosted `musu-desktop-x64.msix`는 sideload 빌드와 **SHA256 byte-identical** (store-reviewed variant는 올바르게 미호스팅).
- 서명 thumbprint `65F5926444D563966C75F000C384C8530B1D8DD8` = Install-MUSU.ps1 pin (canonical 키 재사용).
- 버전 monotonic 1.13→1.15 + `ForceUpdateFromAnyVersion` (재설치 커버). 5개 asset HTTP 200.
- secret 누출 0: `.local-build/` gitignore, `.pfx` 미추적, `$CertPassword="password"`는 self-signed beta 키라 무의미(공개 cert + out-of-band thumbprint pin).
- **LOW 2건 (미래 하드닝)**: ① 미래 빌드가 canonical 키 없이 `-GenerateCert`도 없으면 `winapp pack`이 서명 없이 fall-through(현재 미발동) → 서명경로 미해결 시 throw 가드 권장. ② publish가 MANUAL이라 drift canary 없음 → 5-asset HEAD canary 권장(publicRelease.ts 주석이 이미 처방).

### setup.exe byte-검증 한계 (정직)

audit의 OPEN question(setup.exe가 onboarding 코드를 byte-포함하나)을 추적: **Tauri는 frontend 자산(out/)을 압축해 musu-desktop.exe에 임베드**하므로, exe 평문 grep으로는 `renderFleet`(구버전에도 있던 문자열)조차 안 잡힌다 = grep 방식 자체가 부적합(누락 증거 아님). 빌드 인과(out 15:32 → exe 16:04 → NSIS 16:04)는 강한 정황이나 **byte-proof는 실제 설치 후 빈 화면 확인이 유일**. → 다음단계 잔여.

## 설치본 시각 검증 완료 (byte-proof + IPC 동시 해소, 2026-06-18)

새 MSIX(onboarding 포함)를 **실제 설치**(`Add-AppxPackage`; 같은 버전번호라 0x80073CFB → 기존 제거 후 설치)하고 cockpit 실행 → 빈 상태 스크린샷(`.local-build/desktop-screenshots/installed-onboarding-20260618.png`). 라이브 확인:
- ✅ "This PC is connected and ready." 재프레임 타이틀
- ✅ "Give it a task below — then walk away. MUSU notifies you when it's done." 루프 카피
- ✅ "Give this PC a task →" primary CTA + "Add another PC (optional)" secondary link(M1 강등)
- ✅ 예시 칩 2개 ("Introduce yourself…" / "Write me a short status report…") + "Try:" 라벨
- ✅ placeholder "What should this PC do?", Add-PC 패널 자동오픈 안 됨
- ✅ connector-policy("External APIs are reviewed…") **화면에 없음 = 접힘 확인**(상단 "Private Mesh proof"는 별개 mesh 위젯)

**이것으로 byte-proof + 실 IPC + 픽셀 레이아웃 약점 3개 중 2개 해소.** 설치된 musu-desktop.exe = 6/18 빌드(설치 전 6/17 onboarding-이전 빌드에서 교체 확인). Tauri 압축 임베드라 exe grep은 불가했지만, **실 설치+실행 화면이 onboarding 코드 동작의 직접 증거**다.

## 배포 하드닝 완료 (LOW 2건, 2026-06-18, `b4ef885e`)

audit의 LOW 2건을 닫음:
- **`build-msix.ps1` 서명경로 throw 가드**: -CertPath/canonical키/-GenerateCert 어느 것도 서명경로를 못 잡으면 throw(기존 silent fall-through = unsigned pack → auto-update publisher trust 깨짐). DryRun 예외.
- **`canary-desktop-release.ps1` (신규)**: publicRelease.ts의 DESKTOP_*_URL 상수를 직접 파싱(site와 drift 불가)해 라이브 release 5 asset에 HEAD. 비-200 → exit 1. publish가 MANUAL이라 forgotten-upload drift 가드. 검증: 5/5 200.

## 남은 다음 단계

1. **2-machine E2E** (auto-mesh-join, 🔴 실기기 2대 필요 — 이 환경 단일 머신이라 **BLOCKED**): 2번째 PC 설치→로그인→같은 acct-* fleet 자동합류→ping(`musu mesh verify`)→격리 검증. 이번 배포로 설치본엔 자동합류 코드가 들어갔으니, 실 2번째 PC 확보 시 V28 thesis 진짜 종결. (단일 머신으로는 single-node E2E까지가 한계 — 별개 세션에서 이미 완주)

## 관련 문서
- [`DESKTOP_BRIDGE_ONBOARDING_SPEC_AND_ROADMAP_2026_06_09.md`](DESKTOP_BRIDGE_ONBOARDING_SPEC_AND_ROADMAP_2026_06_09.md) — 데스크탑=로컬브릿지 onboarding 스펙(상위)
- [`DESKTOP_COCKPIT_GUI_DESIGN_2026_06_10.md`](DESKTOP_COCKPIT_GUI_DESIGN_2026_06_10.md) — cockpit GUI 설계
- [`SESSION_ACCOUNT_AUTO_MESH_JOIN_2026_06_18.md`](SESSION_ACCOUNT_AUTO_MESH_JOIN_2026_06_18.md) — 같은 날 mesh 자동 join(별개, 미머지)
- [`ONBOARDING.md`](ONBOARDING.md) — 2번째 머신 추가 가이드

## 관련 메모리
- `project-musu-s-tier-cockpit` — S등급 cockpit 작업 누적
- `feedback-gstack-periodic` — frontend UI 변경 후 dogfood
