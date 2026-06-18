# MUSU Cockpit UX 재설계 스펙 (2026-06-18)

**Status:** 설계안 (코드 전), **Critic 게이트 통과(HIGH 3 + MEDIUM 2 반영)**. 딥리서치(Tier-1 레퍼런스) 기반. 구현은 별도 단계.
**Scope:** cockpit Tauri shell UI (`musu-bee/src-tauri-shell/` index.html · main.js · styles.css). auth/schema/mesh 로직 무관 — **재배치 + 조건부 렌더 + 디자인 토큰화**이지 재작성 아님.
**Trigger:** 사용자 "gui가 직관적이지도 않고 ui/ux가 별로다" → 딥리서치로 방향 도출.

## 진단 (실제 설치본 스크린샷 기준)

`.local-build/desktop-screenshots/installed-onboarding-20260618.png` 실측 5문제:
1. **3개 분리 블록** — 상단(fleet 관리) / 중앙(빈 CTA) / 하단(order box)이 끊겨 "뭘 해야 하지"가 한눈에 안 옴.
2. **빈 중앙** — 활동이 와야 할 본체가 비어 CTA만 떠 있음.
3. **필터 탭 6개**(ALL/ONLINE/TARGETABLE/THIS PC/STALE/OFFLINE) — 머신 1개인데 과노출 = 인지 부하.
4. **올-다크 저대비** — 회색조 텍스트, 노란 CTA만 튐 = 위계 약함.
5. **전문용어** — TARGETABLE / STALE / Private Mesh proof / DERP private 등 첫 사용자에 의미 불명.

## 핵심 framing (리서치 결론)

**MUSU = Tailscale(머신 레이어) + Devin(태스크 레이어) 적층 + Warp 블록 스트림(본체) + Ctrl-K 팰릿(탈출구).** 새 vocabulary를 발명할 필요 없음 — 같은 문제를 이미 푼 제품들이 수렴한 패턴을 차용.

## 현재 코드 ↔ 추천 IA 갭

현재 DOM 순서 (`index.html`):
```
header.top → #fleet-section { section-head(Add PC) · #fleet-filters(6탭) ·
  #mesh-proof-strip · #release-evidence-strip · #add-pc-panel · #first-task-aha ·
  #fleet-empty · #connector-policy · #order-examples · .order-box }
→ #task-feed(running/done, 맨 밑) → diag
```
**중요: Warp 블록(`#task-feed`)도 Ctrl-K(`#palette`)도 이미 존재한다.** 문제는 *순서와 위계*지 부재가 아님. order-box가 fleet 잡동사니 아래, task-feed가 화면 맨 밑 = 활동이 안 보이고 입력이 묻힘.

추천 IA (단일 세로 컬럼, 3존):
```
[ fleet status strip ]  ← 얇게. dot+plain text. 필터바는 N≥7일 때만
[ 활동 스트림 (본체) ]   ← #task-feed를 여기로. Warp 블록, done=결과 inline
[ persistent composer ]  ← order-box를 hero로. 자동포커스, target chip 인라인
  Ctrl-K → #palette (이미 있음)
```

## 설계 지침 (D1–D8, 우선순위)

| # | 지침 | 레퍼런스 | 코드 매핑 |
|---|------|----------|-----------|
| **D1** | 태스크 입력=hero, fleet=얇은 status strip | Cursor 2.0 | `.order-box` 시각 비중↑, `#fleet-section` 헤더부 strip화 |
| **D2** | bottom composer(지속) + Ctrl-K 팰릿(소환). 택일 X | Raycast/Linear/Superhuman | order-box 하단 고정 유지 + `#palette` 강화 |
| **D3** | 활동 = Warp Block(태스크1=카드1: 요청+머신+상태+결과, done시 접힘) | Warp | `#task-feed` 카드 모델 정비 + 위치 상향 |
| ~~**D4**~~ | ~~필터 6탭 N<7 숨김~~ **폐기 (Critic HIGH)** | — | Ctrl-K 백스톱이 코드에 **없음**(palette에 필터 명령 0개, main.js:4079-4097). musu 1-3대 규모에선 숨기면 unreachable dead code. → **필터 유지**, "thin strip" 재배치(D1)로 비중만 낮춤 |
| **D5** | 위계 = 표면 밝기 사다리 + 3단 텍스트(단일 accent 의존 X) | Linear/Material/Radix | styles.css 토큰화 (아래 §토큰). **상태색(green/amber/red) 보존** |
| ~~**D6**~~ | ~~"done"=결과 surface~~ **이미 ship됨 (Critic)** | Temporal/Vercel | `renderTaskCard` main.js:3642-3648가 이미 output/error/artifact inline. step5는 "output을 single-line→scrollable preformatted"로만 구체화 |
| **D7** | fleet행=Tailscale식(dot+"last seen"+평문상태), 태스크=Devin식(관계라벨+안읽음 dot) | Tailscale/Devin | "STALE/OFFLINE/TARGETABLE"→"Ready/Asleep/last seen X" 카피 교체 |
| **D8** | 정직 베타 라벨 + 검증가능 locality 카피(색만 의존 X, dot+텍스트) | web.dev/trust | connector-policy 카피 정직화, 상태 dot+라벨 |

## 디자인 바이블 = musu.pro 사이트 (사용자 지시 2026-06-18)

사용자: "로고는 지금 파비콘/웹사이트 그거, 컬러팔레트·디자인 바이블도 지금 웹사이트 디자인 참고(웹이 좋으니까), 온보딩도 잘 살려." → **cockpit을 사이트와 시각 일관**시킨다. 일반 리서치값이 아니라 **`musu-bee/src/app/globals.css`의 실제 토큰을 소스**로.

추출한 사이트 바이블:
- 배경: `--bg-base #09090b`(zinc-950), 표면 zinc-900/800, `--bg-elevated #27272a`
- 텍스트: `--fg1 #ffffff` / `--fg2 #a1a1aa`(zinc-400) / `--fg3 #71717a`(zinc-500) / `--fg4 #52525b`(zinc-600)
- accent: **주 cyan `--accent #24c8db`(emerald)** + `--brand-yellow #ffc131` + `--brand-accent #FF9800`
- 상태: online `#22C55E` / running `#3B82F6` / error `#EF4444` / warn `#FF9800` (Tailwind 표준)
- radius: 6/10/16/24/32, 폰트: Outfit/Inter/Space Mono
- 로고: `public/images/logos/musu-logo-header-on-dark.png`(노랑+cyan 맞물린 고리 마크), 파비콘 `public/images/favicon-header.png`

**step1 적용(완료, `feature/cockpit-redesign-tokens`)**: cockpit `:root` 토큰을 사이트값으로 정렬(이름 보존, 값만 — 168 color-mix 안전). amber→`#ffc131`(사이트 brand-yellow), 상태색→사이트 Tailwind 표준, 텍스트 3단→사이트 fg1-4. ink-faint 대비 2.9→3.6(WCAG 3:1 통과, "저대비" 불만 해소). 헤더 인라인 헥사곤 SVG→실제 로고 PNG(`assets/musu-logo.png`, object-fit cover left 크롭). 빌드 스크립트에 `assets/` 복사 추가. 검증: 테스트 49/49 + browse 시각(로고·색감·온보딩 빈상태 살아있음 확인).
**deferred**: 사이트 주 accent인 cyan `#24c8db`을 cockpit 보조 accent로 도입(amber color-mix 168곳 영향 → step3 레이아웃 때). 폰트 Sora/JetBrains→Outfit/Inter/Space Mono 정렬(별도 판단).

## 다크테마 토큰 (사이트 바이블 정렬 — 아래는 일반 Tier-1 참고값)

**회색 ramp는 OKLCH/LCH 생성**(HSL 아님 — 등간격 광도가 등간격으로 *보이게*).

표면 사다리 (높을수록 밝게, 순수검정 금지):
| 레이어 | 값 |
|--------|-----|
| 페이지 | `#0a0a0a`~`#121212` |
| 패널/strip | `#171717` |
| 카드/블록 | `#1f1f1f`~`#262626` |
| 팝오버/팰릿 | `#2e2e2e`~`#404040` |
| 스텝 | 레이어당 +5~8% 광도 |

텍스트 3단:
| 단 | 값 |
|----|-----|
| primary | `#ededed`~`#fafafa` (순수흰색 X) |
| secondary | `#a1a1aa` |
| tertiary | `#737373` |
| floor | WCAG 4.5:1 body / 3:1 large — secondary 최소, primary 초과 |

- border: `#27272a`~`#3f3f46`. focus=border 밝히기(컬러링 X). 선택=같은 z-plane 행 밝히기(레이어 적층 X).
- spacing: 8px 그리드+4px half. ramp 4/8/12/16/24/32/40/48/64. 컴포넌트 패딩 4-16, 섹션 갭 24-64.
- type: 1.25 비율, 12/14/16/18/20/24/30/36/48, line-height 8px 스냅, weight≥400(강조는 색으로), Inter.

## 단계별 구현 계획 (제안 — 작은 것부터, 가역)

각 단계 후 cockpit-contract.test.ts 갱신 + 빌드 후 시각 검증.

1. **토큰화 (D5)** — styles.css `:root`에 표면 사다리/텍스트 3단/spacing/type 토큰 추가. **moderate-risk(Critic)**: raw hex 20개 + `rgba()/color-mix()` 168곳. **상태 시맨틱 토큰(`--online:#5fd08a` `--amber:#ffc857` `--bad:#f0776a` `--warn:#f0b54a`)과 color-mix 패턴은 보존**, gray 사다리+텍스트만 재매핑. 단계1에선 위치 무관한 *ramp 정의*만; 이동될 zone의 spacing/elevation polish는 step3 후로 미룸. (release-evidence의 `#047857`/`#b91c1c` light-theme 색은 선제 flag — 멋대로 "고치지" 말 것)
2. **카피 평문화 (D7/D8)** — STALE/TARGETABLE/DERP/Mesh proof → Ready/Asleep/last seen + locality 정직 카피. *독립적, 안전, 아무때나 가능.*
3. **DOM 재정렬 + visibility 우선순위 재작성 (D1/D3) — 가장 큰 변경(Critic, "reposition" 아님, LOC ×2+)** — `#fleet-section` 안 6형제(`#task-feed`/`.order-box`/`#order-examples`/`#connector-policy`/`#fleet-empty`/`#first-task-aha`)가 `renderFleet`에서 *함께* visibility 계산(main.js:2818-2863, 3395-3405). task-feed를 order-box 위 본체로 올리려면 **명시적 render-order 계약 필수** (아래 §render-order). fleet-section 헤더부=얇은 strip, order-box 하단 hero 유지.

(step5 D6 삭제 — 이미 ship됨. 필요시 step1~3 안에서 "output single-line→scrollable preformatted"만 곁들임)

### §render-order 계약 (step3 전제, Critic HIGH 해소)

각 상태에서 본체 zone이 무엇을 표시하는지 명시 — 빈 상태 vs 활동 스트림 충돌(바로 이 재설계 트리거 화면) 해결:

| 상태 | 본체 zone | 비고 |
|------|-----------|------|
| 0 task & 1 machine (트리거 화면) | `#fleet-empty`가 본체 점유 | 첫 작업 CTA + 칩(onboarding). task-feed hidden |
| 0 task & 0 machine | `#fleet-empty` (다른 카피) | — |
| ≥1 running task | `#task-feed`가 본체, `#fleet-empty` yield | 첫 task 제출 시 전환 |
| done tasks only | `#task-feed` (done 그룹) | 결과 inline |

규칙: **task-feed 카드 0개면 `#fleet-empty`가 본체, 첫 task가 그것을 밀어냄.** 이건 구현 디테일 아닌 plan 결정.

## 피해야 할 것 (avoid)

- N=0/1에 6탭 필터바 (NN/G 안티패턴).
- 중앙 hero를 *유일* 입력으로 (지속 루프엔 부적합 — bottom composer+소환 팰릿).
- 색만으로 상태 (dot+텍스트 필수; Tailscale 다크모드 초록 오표시 버그 사례).
- 초록 done 뱃지가 결과 대신 서기 (첫 헛초록에 신뢰 붕괴).
- 첫 사용자에 인프라 용어 노출.
- 순수흰/순수검정 텍스트 (halation).
- 마케팅 superlative (정직 베타 라벨이 더 신뢰).
- progressive disclosure 2단계 초과.

## Critic 게이트 결과 (frontend-architect, 코드 전 적대적 검토 — 반영 완료)

코드 전에 잡아 스펙 reshape:
- **HIGH-1 D4 폐기**: 필터 N<7 숨김의 Ctrl-K 백스톱이 코드에 부재(palette 필터 명령 0개) → 1-3대 규모에선 unreachable dead code. D4 제거, 필터 유지+strip 비중 저감으로 대체. *그 자체가 over-engineering 회피.*
- **HIGH-2 step3 재명명**: "reposition" 아님 — 6형제 DOM 재정렬+얽힌 visibility. render-order 계약 추가, LOC ×2+.
- **HIGH-3 빈상태 충돌 해소**: 0-task/1-machine(트리거 화면) 본체 zone 규칙 명시(§render-order).
- **MED-1 토큰화 reframe**: moderate-risk(168 color-mix), 상태색 토큰 보존 명시.
- **MED-2 D6 삭제**: 이미 ship됨(main.js:3642-3648). step5 제거.
- Critic 확인(INFO): Warp-block framing은 *레이아웃 아이디어*만 차용(기계장치 신규 X), 이미 존재 → over-engineering 아님. 위험은 D4였고 제거함.

## 위험 / 열린 질문 (Critic 반영 후 잔여)

1. **§render-order 계약이 step3의 핵심** — 구현 시 4상태 전수 시각 검증 필요.
2. **`#connector-policy`(밀도 높은 gate UI)가 재배치 후 본체와 경쟁** — IA에서 demote할지 결정 필요(Critic OQ1).
3. **토큰화 시각 회귀** — color-mix 168곳, 상태색 보존하며 gray만 재매핑. step1 작게+시각 diff.
4. **release-evidence `#047857`/`#b91c1c` light-theme 색** — pre-existing로 보임. tokenize 중 멋대로 고치지 말고 별도 판단(Critic OQ3).
5. **검증 한계** — JSDOM은 레이아웃/색 안 잡음. 빌드+실설치 시각 검증 필수.

## 레퍼런스 (딥리서치, Tier-1 수렴)
Warp(block model) · Linear(LCH elevation, redesign) · Cursor 2.0(agent-centered) · Tailscale(device row, 평문 상태) · Devin(task status, 안읽음 dot) · Temporal/Vercel(done=결과) · NN/G(empty state·progressive disclosure) · Radix/Material/Geist(다크 토큰) · web.dev(offline UX, 색+텍스트).

## 관련
- [`SESSION_COCKPIT_ONBOARDING_FIRST_TASK_2026_06_18.md`](SESSION_COCKPIT_ONBOARDING_FIRST_TASK_2026_06_18.md) — 직전 onboarding 작업(빈 상태 재프레임). 이 재설계가 그 위에 올라감.
- [`DESKTOP_COCKPIT_GUI_DESIGN_2026_06_10.md`](DESKTOP_COCKPIT_GUI_DESIGN_2026_06_10.md) — 기존 cockpit GUI 설계
- 메모리 `project-musu-s-tier-cockpit`
