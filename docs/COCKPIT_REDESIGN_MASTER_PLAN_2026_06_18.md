# MUSU Cockpit 재설계 — 마스터 플랜 (2026-06-18)

**Status:** 마스터 플랜. 개별 워크스트림은 진행 시 세부 플랜 문서 작성.
**근거:** `COCKPIT_UX_REDESIGN_SPEC_2026_06_18.md`(딥리서치+Critic) + Explore grounding 리포트(코드 표면 file:line 확인).
**Thesis (사용자 승인됨):** cockpit을 musu.pro 디자인 바이블에 정렬 + 레퍼런스 대비 기능 gap 메우기 + 직관적 UX. 새 thesis 아니므로 Phase -1 전략게이트 스킵.

## 완료 (브랜치 `feature/cockpit-redesign-tokens`, main 미머지, 49/49)

- ✅ **step1** 토큰 사이트 정렬 + 실제 로고 (`c45044dc`)
- ✅ **A1-A4** 계정 메뉴 + 설정창(Account/Appearance/About) + Ctrl+, (`59213f87`)
- ✅ **step2** 카피 평문화 (`35887805`)
- ✅ **B1** 트레이 Quit — 기존 구현 확인(`build_tray`, Show/Quit)
- ✅ **B4/B5/B6** About/버전/테마 — A 설정창에 포함

## 남은 작업 — 워크스트림 분류

Explore가 fast-lane(shell-only, 안전) vs Rust-lane(Critic-gated, blast radius)으로 명확히 가름.

### WS-1 — Fast lane (shell-only, Rust 무관, 먼저)

**WS-1a: step3 레이아웃 재배치 (최대 shell 변경, High)**
- 현 DOM: `#fleet-section` 안 13형제, `#task-feed`가 맨 밑(383-392), `.order-box`가 fleet 잡동사니 아래.
- 문제: 본체 zone 점유를 3개 분리 predicate가 따로 결정(`lastFleetIsEmpty&&filter==all` / `isEmpty&&!firstTaskDone` / task-card count) — **단일 arbiter 없음**. `#fleet-empty`와 `#task-feed`가 동시 표시/숨김 가능(아무도 cross-ref 안 함).
- 작업: (a) DOM 재정렬 — order-box를 hero로 하단, task-feed를 본체로 상향, fleet 관리부를 얇은 strip. (b) **render-order arbiter** 신규 — 4상태 계약(0task+1machine / 0task+0machine / running / done) 단일 함수로 통합.
- 검증: 4상태 전수 빌드+실설치 시각(JSDOM은 레이아웃 안 잡음).
- 세부 플랜 문서 필요 (LOC ×2, Critic 권장).

**WS-1b: 머신 상태 배지 + "you are here" 마커 (B2 일부, Low-Med)**
- 데이터 이미 있음(`is_this_pc` 2974, `last_seen`, online state). this-pc 배지도 이미 존재.
- 작업: 노드 행에 online/last-seen 상태 배지 강화 + 현재 PC 마커 또렷이. Tailscale 패턴.
- 순수 shell.

### WS-2 — Rust lane (Critic-gated, 빌드 무거움, blast radius)

**WS-2a: open_external_url command (B7 help, Low — Rust trivial)**
- shell은 이미 `openHelp()`가 호출(catch 폴백). Rust command만 없음.
- 작업: `open_dashboard`(lib.rs:1311) 복사 — `std::process::Command`(win `cmd /C start`, mac `open`, linux `xdg-open`), `url:String` 파라미터, handler 등록.
- 가장 안전한 Rust 변경. 단독 또는 묶음.

**WS-2b: mesh connect/disconnect 분리 (B3, Med)**
- connect(`private_mesh_join`)은 있음. **disconnect 없음** — `tailscale down`/`logout` 미invoke(에러 메시지 prose로만 안내). `account_logout`(cloud)과 mesh leave가 현재 혼재 = B3가 풀려는 것.
- 작업: `private_mesh_leave` Rust command 신규(`tailscale down`) + shell UI에서 "Disconnect this machine"을 Sign out과 시각 분리.
- Critic-gated (mesh 상태 변경).

**WS-2c: 머신 rename/remove (B2 나머지, High)**
- rename/remove command 전무. `FleetNode`에 node `id` 없음(Headscale는 numeric id로 키). site/headscaleProvisioning.ts도 `/api/v1/node` 호출 0.
- 작업: NEW Rust command + NEW Headscale REST(`POST /api/v1/node/{id}/rename`, `DELETE /api/v1/node/{id}`) + `FleetNode`에 id 노출.
- **가장 큰 blast radius**(노드 삭제 = 되돌리기 어려움). Critic + dual-audit 권장. 세부 플랜 필수.

### WS-3 — Blocked (백엔드/제품 결정 필요)

**WS-3a: 계정 이메일 정체성 (A2 완성, BLOCKED)**
- 클라우드에 `/me`/email/userinfo 엔드포인트 전무. `FleetNode`에 email 없음. 코드 주석도 "we do NOT invent an email" 명시.
- 현재: 정직한 binary 칩("Signed in"/"Local only"/"Not signed in") — 유지.
- 이메일 칩은 **NEW 클라우드 identity 엔드포인트 + Rust command** 필요 = shell 범위 밖. 제품 결정 대기.

## 실행 순서 (의존성)

```
WS-1a step3 재배치 ──┐ (shell, 먼저, 세부플랜+Critic)
WS-1b 상태배지 ──────┘ (shell, step3와 함께 or 직후)
        ↓ (여기서 main 머지 + 재배포 = 사용자 실설치 검증)
WS-2a open_url ────┐ (Rust trivial)
WS-2b mesh leave ──┤ (Rust, Critic)
WS-2c rename/remove┘ (Rust+Headscale, Critic+dual-audit, 세부플랜)
        ↓ (Rust 묶음 빌드 1회 + 재배포)
WS-3a 이메일 = BLOCKED (제품 결정)
```

- **머지 게이트**: WS-1 완료 후 main 머지 + 데스크탑 재배포 = 사용자가 실설치본에서 직관성 판단(Const VII = 사용자 승인). Rust 묶음(WS-2)은 별도 빌드+배포.
- **Rust 변경(WS-2)은 agent-team Critic 거쳐 진행** (스펙 권고). WS-2c는 dual-audit(노드 삭제 blast radius).

## 검증 정책 (전 워크스트림)
- 각 WS: cockpit-contract.test.ts 갱신 + 빌드. shell 변경은 browse 시각. Rust는 cargo check + (배포 시) 실설치.
- 큰 변경(>100 LOC/>5 파일) 후 thermo-nuclear-code-quality-review (메모리 주기).

## TODO (개별 진행 단위) — 진행 상태 (2026-06-19)
1. ✅ WS-1a step3 render-order arbiter + 4상태 (main `2425bedb`)
2. ✅ WS-1b 머신 상태 배지 + you-are-here (main)
3. ✅ WS-1 main 머지 + 데스크탑 재배포 + PrintWindow 실설치 검증 (`b714b361`)
4. ✅ WS-2a open_external_url (main `a2dd4568`)
5. ✅ WS-2b private_mesh_leave + disconnect 분리 + predicate 6 테스트 (Critic 인버전 차단)
6. ✅ WS-2c rename + remove (Critic HIGH×3 + dual-audit; self-eviction fail-closed)
7. ✅ WS-2 Rust 묶음 빌드 + 재배포 (canary 5/5 + PrintWindow 실설치)
8. ⏸ WS-3a 이메일 정체성 = BLOCKED (클라우드 /me 엔드포인트 부재, 제품 결정 대기)

## 데스크탑 재설계 (C-plus, 2026-06-19) — "웹페이지 같다" 답

사용자 피드백 "cockpit이 데스크탑 앱이 아니라 웹페이지 한 페이지 같다 + 목적이 뭐냐" → brainstorm으로 V28 thesis 재확인(fleet-as-one-device, MUSU=binding) + 코드로 쌍방향 통로(Claude Code↔cockpit↔cockpit↔AI) 전 구간 실재 확인. 머신 카드 그리드(Option A) 제안 → **system-architect Critic가 HIGH×3 차단**:
- "데이터 이미 있음" 거짓(setup.rs localhost-only, fleet.rs peer 경로 무관) → 원격 프로그램 표시 = cross-machine bridge 변경, 2-머신 E2E 게이트
- 카드별 command가 V28 §3.1 LOCKED(명령=Claude Code MCP) 충돌 → cockpit=관찰+presence+lifecycle만
- N≥2 최적화하며 N=1 회귀
→ **Option C-plus**(증분·N=1 우선·관찰 전용, `0ac6bf4d`): 데스크탑 밀도(680→880+de-hero) + this-PC 전문프로그램 배지(`this_pc_programs`, /api/setup/status 재사용). 카드 그리드+원격 배지=2-머신 E2E 후.

문서: `COCKPIT_DESKTOP_REDESIGN_BIDIRECTIONAL_2026_06_19.md`.

## 남은 다음 단계 (전부 2-머신 E2E에 게이트)
1. **2-머신 E2E** (🔴 실기기 2대 필요, BLOCKED): 노트북 cockpit/Claude Code → studio-pc가 받아 그쪽 AI 실행 → 결과 회신 + 격리. V28 thesis 진짜 증명 + 쌍방향 통로 라이브 확인. 코드는 다 있고 라이브만 미실증.
2. **N≥2 머신 카드 그리드 + 원격 프로그램 배지** (1 이후): cross-machine bridge에 specialist-program 필드 전파.
3. **WS-3a 이메일 칩**: 클라우드 /me 엔드포인트 신설(제품 결정).
4. (선택) **C-plus 실설치 픽셀 검증**: 다음 MSIX 재빌드 시 PrintWindow로 데스크탑 밀도 확인(browse 샌드박스 불안정으로 이번 미완).

## 관련
- `COCKPIT_UX_REDESIGN_SPEC_2026_06_18.md` — 디자인 스펙(딥리서치+Critic+gap감사)
- `SESSION_COCKPIT_ONBOARDING_FIRST_TASK_2026_06_18.md` — 선행 onboarding
