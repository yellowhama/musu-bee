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

## 남은 다음 단계

1. **데스크탑 재빌드 + 배포**: cockpit 변경을 사용자 설치본에 반영하려면 Tauri 빌드 → MSIX → musu.pro. (auto-mesh-join 미배포분 `feature/account-auto-mesh-join`과 함께 묶을지 결정)

## 관련 문서
- [`DESKTOP_BRIDGE_ONBOARDING_SPEC_AND_ROADMAP_2026_06_09.md`](DESKTOP_BRIDGE_ONBOARDING_SPEC_AND_ROADMAP_2026_06_09.md) — 데스크탑=로컬브릿지 onboarding 스펙(상위)
- [`DESKTOP_COCKPIT_GUI_DESIGN_2026_06_10.md`](DESKTOP_COCKPIT_GUI_DESIGN_2026_06_10.md) — cockpit GUI 설계
- [`SESSION_ACCOUNT_AUTO_MESH_JOIN_2026_06_18.md`](SESSION_ACCOUNT_AUTO_MESH_JOIN_2026_06_18.md) — 같은 날 mesh 자동 join(별개, 미머지)
- [`ONBOARDING.md`](ONBOARDING.md) — 2번째 머신 추가 가이드

## 관련 메모리
- `project-musu-s-tier-cockpit` — S등급 cockpit 작업 누적
- `feedback-gstack-periodic` — frontend UI 변경 후 dogfood
