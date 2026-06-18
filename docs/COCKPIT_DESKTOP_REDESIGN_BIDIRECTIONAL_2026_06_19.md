# Cockpit 데스크탑 재설계 — 쌍방향 오케스트레이션을 드러내기 (2026-06-19)

**Status:** 설계안, **system-architect Critic 통과(HIGH 3 + MED 2 → Option A 폐기, Option C-plus로 reshape)**. brainstorm 합의 + 코드 기반.

## ⚠️ Critic가 코드 전에 뒤집은 것 (반영)

1. **HIGH "데이터 이미 있음" 거짓** — `setup.rs`는 localhost-only 프로브, fleet.rs(peer)에 안 흐름. 원격 머신 프로그램 표시 = "작은 Rust" 아니라 4계층 cross-machine bridge 변경 + 2-머신 E2E 검증 필요. → **데이터 갭 재분류(M/cross-machine), 2-머신 E2E 뒤로 게이트.** 단 *이 PC* 배지는 기존 `/api/setup/status`(ollama_running/comfyui_running) 재사용으로 저렴.
2. **HIGH 명령표면 충돌** — 카드별 quick command가 V28 §3.1 LOCKED("명령 = Claude Code via MCP, 6/15 미터링 회피")와 충돌. → **cockpit = 관찰+presence+lifecycle(rename/disconnect/cancel)만. command authoring 아님. order-box는 de-emphasize된 fallback으로 유지(키우지 않음).** (thesis/policy 게이트 — 다운그레이드 불가)
3. **HIGH N≥2 최적화/N=1 회귀** — 카드 그리드는 N≥2에서만 빛남(미검증 BLOCKED), N=1은 카드1개로 더 나빠짐. → **N=1을 설계 타깃, N≥2는 graceful 확장.**
4. **MED churn** — 48h 내 3번째 재레이아웃. Option C(증분) 안 따짐. → **Option C-plus 채택(아래).**
5. **MED 하드코딩 프로브** — ollama/comfyui 2개 하드코딩은 thesis "binding"의 일반성 없음. → adapter/capability registry에서 소싱하거나 deferred.

## 채택: Option C-plus (Critic reshape) — 증분·single-machine-first·관찰 전용

WS-1(3존) 위에 증분. **그리드 아님.** 가장 작은 첫걸음:
1. **order-box de-hero** — 축소 + fold 아래로(키우지 않음, 명령은 MCP가 파워 표면).
2. **this-PC를 밀도 높은 패널로** — presence(dot+last seen) + **이 PC의 ollama/comfyui 배지**(기존 `/api/setup/status` 재사용, bridge 변경 0) + inline task feed.
3. **whitespace 조이기** — 데스크탑 밀도(웹 랜딩 여백 제거).

**bridge 변경 0, 새 명령 UI 0, N=1에서 작동.** 이게 "웹페이지 같음"이 N=1에서 풀리는지 먼저 검증. 그리드/cross-machine 프로그램 표시는 **2-머신 E2E 실증 후**로 게이트.

---
(이하 원 설계안 — Option A는 Critic로 폐기, N≥2 확장 단계로만 참고)

**Trigger:** 사용자 — "cockpit이 웹사이트 한 페이지 같다. 이 프로그램 목적이 뭐냐?" → brainstorm으로 V28 thesis 재확인 → "쌍방향 통로(Claude Code ↔ cockpit ↔ cockpit ↔ AI)를 드러내는 데스크탑 재설계" 목표.

## 문제 (정확히)

기능 부재가 아니라 **표현**의 문제. 코드상 쌍방향 오케스트레이션이 전 구간 실재(아래 §검증된 기능)하는데, cockpit이 **단일 세로 컬럼 + 머신을 "이름+상태 한 줄"로** 보여줘 웹 폼처럼 보인다. V28 thesis의 위력("여러 머신 × 여러 AI를 하나로")이 UI에서 안 드러남.

## 검증된 기능 (코드 근거 — 재설계가 *드러낼* 대상)

| 구간 | 코드 | 데이터 |
|------|------|--------|
| AI→MUSU (MCP) | `musu-rs/src/control/`(로컬 MCP, codex/claude/gemini/openai_compat_local 어댑터+입력제어 tool) + `musu-bee/src/app/api/mcp/route.ts`("MUSU MCP Server") | AI가 MUSU 호출 |
| MUSU→다른 컴터 | `bridge/handlers/forward.rs`(forwarded task, rendezvous_target_node_id) + `/api/tasks/delegate` | 작업 전달 |
| 컴터2 AI 실행 | adapter registry(codex/claude/gemini/echo) | 받은 task dispatch |
| cockpit→AI | submit_order → `musu route --target` → adapter | 직접 명령 |
| **머신별 전문프로그램 감지** | `bridge/handlers/setup.rs`: ollama(11434)/comfyui(8188) 실행 여부 http 감지 | **각 머신이 뭘 도는지 — thesis의 'specialist program' 데이터, 이미 수집 가능** |

## 핵심 인사이트 (재설계 방향)

thesis = "MUSU는 binding: presence·observation·command·cross-machine handoff". 그럼 cockpit은 **각 머신 = {presence + 도는 전문프로그램(ollama/comfyui/AI) + 오가는 작업}**을 한눈에 보여주는 **오케스트레이션 뷰**여야 한다. 지금은 머신을 한 줄로만 보여주고 입력창을 hero로 둠(웹 폼).

**데스크탑 도구다움 (Linear/Tailscale앱/VS Code 대비 현재 갭):**
- 단일 세로 컬럼 → 머신이 "카드/패널"로, 각 카드가 그 머신의 상태+전문프로그램+활동을 담는 **공간적** 레이아웃
- 입력 hero 과대 → 명령은 V28상 Claude Code(MCP)가 파워 표면. cockpit은 **관찰 우선 + 가벼운 명령**
- 정보 밀도 낮음(웹 랜딩) → 데스크탑 도구는 밀도 높음(한 화면에 fleet 전체 상태)

## 설계 방향 (옵션 — Critic 전)

**A. 머신 카드 그리드 (권장 후보)** — 각 머신 = 카드. 카드 안: presence(dot+last seen) + **그 머신에서 도는 것**(Ollama ●/ComfyUI ●/유휴) + 그 머신의 진행/완료 작업(Warp 블록) + 빠른 명령. 카페에서 노트북 열면 "studio-pc는 ComfyUI 렌더 중, gemma-box는 유휴, 작업 2개 진행" 한눈에. = "fleet as one device"의 시각화.
- 장: thesis 직역. 데이터 이미 있음(setup.rs 감지 + task 상태). 데스크탑 공간 활용.
- 단: 단일-머신 유저엔 카드 1개(빈 느낌) → 단일/멀티 적응 필요.

**B. 좌 nav + 우 detail (Linear/VS Code형)** — 좌측 머신 목록 nav, 우측 선택 머신 detail(활동/전문프로그램/명령).
- 장: 전형적 데스크탑. 머신 많을 때 확장.
- 단: 1-3 머신엔 과함. "하나의 기기처럼"보다 "머신 관리자"느낌.

**C. 현 세로 컬럼 유지 + 밀도/카드화만** — 지금 구조에 머신 카드 + 전문프로그램 표시만 추가.
- 장: 작은 변경, WS-1 재설계 위에 증분.
- 단: 근본 "웹페이지 같음" 안 풀림.

→ **A(머신 카드 그리드) 방향 제안.** 단일-머신은 카드1+"Add PC"로 자연 축소, 멀티는 그리드.

## 데이터 갭 (구현 전 필요)
- FleetNode에 **"도는 전문프로그램" 필드 없음** — setup.rs가 감지하나 fleet 목록엔 미노출. → bridge dashboard/FleetNode에 specialist program 상태 추가 필요(Rust, 작음).
- 머신별 활동(task)을 머신 카드에 매핑 — task에 source_node/target 있음(forward.rs), cockpit task-feed를 머신별로 그룹핑.

## 위험 / 열린 질문
1. **명령 표면 중복** — V28은 Claude Code(MCP)가 파워 명령. cockpit이 명령을 얼마나 가질지(관찰 우선 vs 동등). brainstorm 미결 — Critic/사용자 확인.
2. **단일-머신 UX** — 카드 그리드가 1대일 때 빈약. 적응 규칙 필요.
3. **specialist program 감지 확장** — 현재 ollama/comfyui만. 다른 프로그램은? (thesis는 "binding", 감지 목록 확장성)
4. **큰 변경** — WS-1(3존) 위에 또 재구조. LOC 큼, 단계화 필요.
5. **2-머신 E2E 미검증** — 카드 그리드의 "다른 머신 작업" 부분은 실기기 2대로만 진짜 검증(BLOCKED).

## 게이트
- **Critic(system-architect 또는 frontend-architect)**: A vs B, 명령표면 중복, 단일-머신 적응, 데이터 갭 현실성.
- 그 후 단계화(데이터 갭 Rust → 머신 카드 shell → 전문프로그램 표시 → 활동 머신별 그룹핑).

## 관련
- `MASTER_PLAN_V28_FLEET_AS_ONE_DEVICE_2026_06_11.md` — thesis LOCKED
- `COCKPIT_REDESIGN_MASTER_PLAN_2026_06_18.md` — WS-1/2(완료), 이건 WS-3급 새 방향
- 메모리 `decision-musu-v28-fleet-as-one-device`, `decision-musu-3tier-thesis`
