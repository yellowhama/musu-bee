# MUSU 전수조사 + 해외 상용 서비스 정성평가 비교 (2026-06-11)

**Method**: 4 parallel audits — (1) musu-rs 런타임 (very thorough Explore), (2) 데스크탑 cockpit UX/UI (very thorough Explore), (3) musu.pro 사이트+API (very thorough Explore), (4) 해외 상용 비교 deep-research (기존 wiki 6/7 SaaS 리서치 2건 기반 + 2026-06 현재 웹 검증).
**Branch context**: `fix/audit-findings-2026-06-08`, GOAL v988 시점.
**Honesty rule**: 점수는 상용 제품 기준 절대평가. 자기위안 없음.

---

## §1 내부 전수조사 점수표

### 1A. musu-rs 런타임 (~40K LOC, 13 modules)

| 차원 | 점수 | 한 줄 |
|---|---|---|
| 아키텍처 일관성 | 6/10 | 모듈 구조는 합리적. bridge 13K가 catch-all, cli_commands.rs ~3K LOC 비대(run_route 한 함수 244줄), CLI가 bridge 내부 라우팅 로직에 역결합 |
| 핵심 동사 품질 (musu route) | 5/10 | 동작하나 hardening 미완 — 재시도 없음, peer 폴백 없음, mid-wait peer down 시 원인 안 알려주고 타임아웃, 10s submit 타임아웃 빡빡 |
| 신뢰성 엔지니어링 | 6/10 | boot-orphan recovery(crash 후 pending→failed 플립)는 production급. 그러나 E2E crash/recovery 시나리오 테스트 0건. mesh 0 tests, io 0 tests, control 4 tests |
| 보안 자세 | 7/10 | constant-time 토큰 비교, path traversal 차단, loopback-strict auth 등 진지함. 단 peer identity 자기주장(H2), spawn binary allowlist 없음, 토큰 메모리 zeroize 없음(R3 예정) |
| 멀티머신 스토리 | 4/10 | LAN(mDNS/manual)+Tailscale 동작, cloud는 discovery만. **relay/QUIC은 타입만 있고 transport 미구현** — NAT 뒤 머신은 못 닿음. router에 Relay variant 자체가 없음(정직한 코드) |
| 어댑터 시스템 | 7/10 | trait 깔끔, 5개 구현(claude/gemini/codex/openai_compat/mock), 에러 패리티 좋음. **스트리밍 없음**(서브프로세스 완료까지 블로킹), tool_use 구조화 없음 |
| 죽은 코드 | 8/10 | deprecated 명시 마킹(MCP 스텁 5개 V25 제거 예정), Python facade는 의도적 shim. TODO/FIXME 0건 |

**경쟁사 staff engineer가 꼽을 top 5 비판**: ① relay 부재 = 원격 머신 미지원(LAN 전용 제품) ② CLI 레이어 비대(submission engine 분리 필요) ③ crash recovery E2E 미검증 ④ peer identity 약함(LAN perimeter 의존) ⑤ 어댑터 비스트리밍(긴 생성 동안 빈 화면).

**판정**: LAN+Tailscale 소규모 사용엔 7/10, 상용 광역 배포 기준 5/10. relay+E2E테스트+CLI리팩터+스트리밍 = 2-3 엔지니어링 개월.

### 1B. 데스크탑 cockpit (Tauri, no-framework HTML/JS/CSS)

| 차원 | 점수 | 한 줄 |
|---|---|---|
| 첫 실행 경험 | 6/10 | cert 신뢰(admin PS) → MSIX → 브라우저 승인. 진행 표시 없음, 15s 폴링 지연, 외부 브라우저 강제 |
| 정보 설계 | 7/10 | 위계는 맞음(fleet+order box 전면, 배관은 서랍). **그러나 "뭘 하고 있는지"가 통째로 없음** — task progress/결과/히스토리 부재 |
| 인터랙션 완결성 | 4/10 | **fire-and-forget**: 주문 → "sent" 4초 표시 후 소멸. task ID 없음, 진행 없음, 결과 없음, 취소 없음. task 생명주기의 ~70%가 비가시 |
| 시각/미적 품질 | 8/10 | 토큰 체계 일관(앰버 단일 시그널, graphite 6단), JetBrains Mono+Sora, grain 의도적, AI-slop 없음. focus outline 부재는 a11y 갭 |
| 상태머신 견고성 | 5/10 | connecting/fleet/local-only/degraded 처리됨(클라우드 장애 시 this-PC 유지 똑똑함). 미처리: 토큰 만료 자동복구 없음, bridge mid-session crash 알림 없음, autostart+manual start race 미해결(코드 주석이 자인) |
| 플랫폼 통합 | 3/10 | **트레이 없음, 알림 없음, deep link 없음, 앱-레벨 auto-update UI 없음.** single-instance만 됨. Docker Desktop/Tailscale 대비 ~2년 뒤 |
| 스펙-현실 드리프트 | F | ONBOARDING.md의 3-패널 cockpit/Generative UI/모드 전환은 미구현. 현재 앱은 스펙의 ~20% |

**디자이너가 먼저 고칠 top 5**: ① 트레이+상주(서비스인데 수동 실행 앱) ② task 추적+결과 표시(fire-and-pray → fire-and-monitor) ③ 알림+토큰만료 자동 재인증 ④ device-flow를 QR/딥링크 in-app화 ⑤ 10대+ 머신용 테이블/벌크 뷰.

### 1C. musu.pro (Next.js 16)

| 차원 | 점수 | 한 줄 |
|---|---|---|
| 제품 내러티브/카피 | 7.5/10 | "One command. Ten machines." 5초 안에 박힘. FAQ 정직. 단 "Direct machine-to-machine"은 미래형(relay 410), 가격 "soon" 3회 반복 |
| 설치 퍼널 | 5/10 | Windows: cert import(admin PS) = **최대 퍼널 킬러**(이탈 30-50% 추정). mac/linux curl 1줄과 격차 큼 |
| API 표면 | 6/10 | device-flow v1는 rate-limit+Zod로 production급. /me 없음, plan/billing API 없음, 팀 없음, bridge surface 410, nodes DELETE rate-limit 없음 |
| 디바이스 승인 UX | 8/10 | 머신명+카운트다운+경고문 명확. Deny 버튼 없음, 승인 후 안내 없음 |
| 시각 디자인 | 6.5/10 | 네오브루탈리즘 3색은 자체 일관적. 데스크탑 앱과 연결고리는 로고뿐, 서브제품 색이 전부 같은 3색 매핑(위계 없음) |
| 웹 콘솔 부재 | 3/10 | fleet 원격 가시성/원격 디스패치/팀 핸드오프 전부 없음. 의도적 일시정지지만 랜딩의 "morning report / works while you sleep" 카피와 충돌 |
| 운영 성숙도 | 6/10 | SEO/애널리틱스/legal 있음. 서포트 연락처 없음, FeedbackButton이 410 엔드포인트로 감, GDPR 삭제 API 없음 |

**종합 5.9/10** — "랜딩은 야심차고, 인프라는 scaffolding."

---

## §2 시장 사실 (2026-06-11 검증)

1. **카테고리 무덤**: Terragon 폐업(2026-02, 코드 OSS화 후 Claude Code Web으로 안내), Bloop(Vibe Kanban) 호스팅 종료. **"남의 코딩 에이전트를 자기 클라우드에서 돌려주는 유료 thin wrapper"는 1st-party(Claude Code Web, Codex Cloud)에 패배.** 생존자 = 무료/OSS/BYO(Conductor, Happy, Vibe Kanban) 또는 엔터프라이즈 self-hosted(Coder, Factory).
2. **OpenAI Codex 앱이 Remote Connections 출시** — MUSU의 핵심 동사를 빅벤더가 출시. 폰→데스크탑 QR 페어링, 머신→머신 제어, ssh config 자동 감지, blind relay. 단: 단일 ChatGPT 계정, fleet 뷰 없음, **Windows는 다른 머신을 제어 못 함**(피제어만).
3. **Claude Code 세션 이동성 성숙**: `/remote-control`(로컬→폰/웹), `--teleport`(클라우드→터미널). fleet 개념은 없음.
4. **⚠️ 검증 필요(중요)**: 2026-06-15부터 Anthropic이 인터랙티브/비인터랙티브 구독 사용을 분리(headless `claude -p`, Agent SDK, 서드파티 앱이 별도 "Agent SDK credit" 차감)한다는 보도. **사실이면 MUSU의 "네 구독으로 공짜로 돌린다" 경제성을 직격.** 1차 소스 검증 태스크 필요.
5. Copilot 사용량제 전환(6/1), Coder Agents(self-hosted 전체 스택, 엔터프라이즈) 베타, "agent control plane"이 명명된 카테고리가 됨(OpenHands 정의).

## §3 벤치마크 비교 그리드

벤치마크 3+1: **Codex 앱**(빅벤더가 만든 같은 동사), **Conductor**(병렬 에이전트 cockpit 최고), **Happy**(신뢰+온보딩 최고), **Tailscale**(fleet 온보딩 yardstick).

| 차원 (0-10) | MUSU | Codex 앱 | Conductor | Happy | 기준 |
|---|---|---|---|---|---|
| 첫 가치까지 단계 수 | **3** | 8 | 8 | 9 | Happy: npm+QR 3단계. MUSU Windows: ~8단계(cert+admin PS 포함) |
| 디바이스 페어링 제스처 | **6** | 9 (QR) | 8 (기존 로그인 재사용) | 9 (QR) | MUSU device-flow는 코드+외부브라우저, 동작은 함 |
| Fleet 가시성 (presence/last-seen) | **6** | 2 | 3 (단일 머신) | 3 | **MUSU가 유일하게 진짜 fleet 목록 보유** — Tailscale(10) 대비는 멀지만 에이전트 제품군 중 선두 |
| "이 머신에 일 시켜" 표현력 | **5** | 7 | n/a | n/a | MUSU: LAN+self만(NAT 불가), fire-and-forget. Codex: relay 있으나 단일계정·Windows 제어자 불가 |
| 병렬 실행 cockpit (한눈 상태) | **2** | 8 | 9 | 5 | MUSU에 task feed 자체가 없음 |
| 결과물 (diff/PR 리뷰 in-product) | **1** | 8 | 9 | 6 | 모든 상용 제품의 공통분모. MUSU 부재 |
| 모바일/원격 승인 루프 | **2** | 8 | 2 | 9 | MUSU 웹 콘솔 410 |
| 신뢰 자세 (E2E/relay blind/증거) | **6** | 6 | 5 | 9 | MUSU 로컬실행 실재+evidence 설계는 강점이나 E2E 암호화 주장 못함, peer identity 약함 |
| 실행 비용 (벤더 컴퓨트 0?) | **9** | 8 | 10 | 10 | MUSU BYO ✓. 단 Anthropic SDK credit 리스크 |
| 데스크탑 플랫폼 통합 | **3** | 8 | 7 | n/a | 트레이/알림/autostart 부재 |

## §4 차별화 vs 추격 (정직 분류)

**진짜 차별화 (빈 자리, 방어 가능):**
1. **개인 머신 fleet 자체가 제품** — Codex Remote Connections이 유일한 시도인데 fleet 뷰 없음·단일계정. "Tailscale machines list인데 각 행이 작업을 받는다"는 아무도 안 만듦.
2. **Windows-first** — Conductor Mac 전용, Codex는 Windows가 제어자 못 됨, Happy/Omnara 폰 중심. Windows cockpit이 Windows fleet을 지휘하는 사분면은 비어 있음.
3. **멀티벤더 에이전트 단일 fleet** — Codex는 Codex만, Claude는 Claude만. claude+codex+gemini를 한 cockpit으로.
4. **no-required-SaaS-compute + 증거** — 개인/prosumer 티어에서 미점유.

**추격 (포지셔닝 아닌 숙제):**
1. 세션 UX(스트리밍 타임라인, diff 리뷰, follow-up) — Codex/Conductor가 올린 바를 그냥 맞춰야 함
2. 모바일 승인 — Omnara/Happy/Codex가 table stakes로 만듦
3. 온보딩 압축 — Happy 3단계가 기준
4. E2E 암호화 스토리
5. **경제성 리스크**: Anthropic 6/15 정책 검증

**무덤 경고**: 이 세그먼트 시체 2구(Terragon, Bloop). 생존 패턴 = 무료/OSS이거나 엔터프라이즈. 소비자 과금은 Omnara $9/mo 하나뿐 — musu.pro 유료 coordination layer의 유일한 선행지표로 추적 가치.

## §5 종합 판정

**MUSU 전체 정성평가: 상용 기준 4.5~5.5/10. 포지셔닝은 9/10 (진짜 빈 자리), 실행은 4/10.**

가장 큰 단일 격차는 relay도 온보딩도 아니고 **작업 관찰 루프 부재**다. 모든 상용 생존자의 공통분모 = "보내고 → 진행을 보고 → diff를 리뷰하고 → 머지한다". MUSU는 "보낸다"에서 끝난다(4초 후 상태 문구 소멸). 이 루프가 없으면 fleet이 10대여도 1대처럼 느껴지고, 차별화 1번(fleet이 제품)이 성립하지 않는다.

**우선순위 권고:**
- **P0 — task feed**: 주문→task ID→진행→결과(diff)를 cockpit에. run_route는 이미 task id+wait 폴링을 가졌으니 bridge `/api/tasks` 표면을 cockpit에 노출하는 wiring 작업이 1차.
- **P1 — 온보딩 압축**: Store 빌드 또는 cert+설치 1클릭 ps1. Codex QR 페어링 아이디어 차용.
- **P2 — 플랫폼 통합**: 트레이+알림+OS autostart. "상주 서비스" 정체성의 최소 조건.
- **P3 — relay transport**: "어디서든 fleet" 주장의 전제. 타입은 준비됨.
- **검증 태스크**: Anthropic Agent SDK credit 분리(2026-06-15) 1차 소스 확인.

## §6 출처/원자료

- 내부: 본 문서를 생성한 4개 audit 에이전트 보고(런타임/cockpit/site/시장). 세부 file:line 증거는 각 audit 본문에.
- 시장: developers.openai.com/codex/remote-connections, code.claude.com/docs(remote-control, web), conductor.build, happy.engineering, omnara.com, vibekanban.com + github.com/BloopAI, terragonlabs.com(폐업 공지), coder.com/solutions/agents, tailscale.com/blog/pricing-v4, github.blog(Copilot 과금), openhands.dev/blog/agent-control-plane, claude.com/pricing(⚠️ SDK credit 분리는 2차 출처, 검증 필요).
- 기반: docs/RESEARCH_AGENT_CONTROL_SAAS_LANDSCAPE_2026_06_07.md, docs/RESEARCH_AGENT_CONTROL_SAAS_OPERATOR_DEEP_DIVE_2026_06_07.md

Search terms: `full product audit`, `commercial landscape comparison`, `task feed P0`, `Codex Remote Connections`, `Conductor Happy benchmark`, `Terragon Bloop graveyard`, `Agent SDK credit risk`, `전수조사 정성비교`.
