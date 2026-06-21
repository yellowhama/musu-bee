# MUSU 상용화 마스터 플랜 — S급 출시 (2026-06-21)

## /goal

> "당신을 무수 프로젝트의 새로운 관리자로 임명합니다. 시니어 엔지니어로써, 프로그램의 완성도를 체크하고, 해외 레퍼런스 서비스들과 비교하여, 일단 할수 있는 모든 역량을 총동원하여, 퀄리티를 S급, 전세계 어디에 내놔도 꿀리지 않게 만들어주시기 바랍니다."

**기준**: "A급 출시 가능"을 넘어 **S급 = 해외 레퍼런스 서비스 대비 꿀리지 않음.** 단순 폴리시가 아니라, 차별성(self-contained fleet 오케스트레이션) 자체의 완성도가 핵심.

---

## §0 Strategic Gate Findings (Phase -1, business-panel-experts 4인 debate)

판정: **🟡 YELLOW** — thesis(상용화) 맞으나 사용자 1차결정 "신뢰인프라 우선"이 **만장일치로 뒤집힘**.

**핵심 사실 정정**: 초기 진단(Explore)은 앱 *로직* 품질(테스트/시크릿/업데이트롤백)만 측정 → "격차=유통/신뢰"라 결론. 패널이 같은 레포에서 반박:
- cross-machine 핵심 루프가 토큰 양쪽 수동 심기 없이는 401 (`forward.rs:838`, `pair.rs:133` — 단, store-and-forward W-1/W-2는 이미 완성·467테스트·musu.pro lease 실증; **2머신 실기기 왕복은 0회**).
- 실시간 QUIC 터널(`relay_transport`)은 미배선(`relay_transport_not_wired`) — store-and-forward와 별개, 직접경로 가속용.

| Sev | Finding | 조치 |
|---|---|---|
| HIGH | "격차=유통/신뢰" 전제가 레포와 충돌 — 핵심 루프 실기기 미검증 | Wave 1 = 루프 실기기 E2E 먼저 |
| HIGH | EV인증서+Sentry+풀CI = self-contained 위반 + 4고객 규모 과투자 | Wave 2 = OV/로컬로그/release.ps1로 축소 |
| HIGH | 번들 ID `com.yellowhama.musu` 출시 후 변경 불가 — 유일한 진짜 launch-blocker | Wave 0 = 지금 확정 |
| MEDIUM | Python 사이드카(8071) = GA 블로커 아님(4 known 고객엔) | 명시적 번들 OR Rust-ported 스코프, 루프 막지 말 것 |
| MEDIUM | 버전 드리프트 + 죽은 waitlist 폼 = 싸지만 실재 | Wave 0 |
| INFO | 앱 로직 품질 양호 — 측정 대상이 "상용 준비" 질문엔 틀린 레이어였음 | — |

**ELIMINATE (만장일치 과투자)**: EV 인증서, Sentry/SaaS 텔레메트리, 풀 CI ceremony.

---

## Wave 구조 (사용자 수용)

### Wave 0 — 비가역·저비용 식별자/버전 정리 (지금, 자율)
출시 후 못 바꾸거나 싸게 끝나는 것만. "신뢰우선"의 진짜 알맹이.

| ID | 무엇 | 파일(실측) | 비고 |
|---|---|---|---|
| **G0-1** ✅ | 번들 ID `com.blossompark.musu`로 통일 | `src-tauri/tauri.conf.json:5` | **완료**. MSIX/Store identity는 이미 blossompark(build-msix.ps1:15)였고 tauri.conf만 옛 yellowhama로 어긋나 있던 정합. 비가역 신규결정 아님. GitHub repo URL `yellowhama/musu-bee`는 별개(origin)라 미변경. |
| **G0-2** | 버전 3소스 일원화 | Cargo.toml `1.15.0-rc.1` / tauri.conf.json `1.15.0` / publicRelease.ts `1.15.0-rc.1` + 하드코딩 `MUSU_1.15.0_x64-setup.exe` URL | 단일 소스 of truth. rc 졸업 시점 사용자 결정. |
| **G0-3** | 죽은 /pro waitlist 폼 | `src/app/pro/page.tsx` (onSubmit/action/fetch 0) | `/landing` 폼이 `/api/waitlist` POST하는 패턴 재사용. 리드 유실 방지. |

### Wave 1 — 핵심 루프 실기기 검증 (blue ocean, 사용자/하드웨어 게이트)
"묶고/굴리고/발전한다"가 진짜 도는 증명. 이게 차별성.

| ID | 무엇 | 상태 |
|---|---|---|
| **W-3** | rc.N MSIX 재빌드+양머신 설치 (relay 코드 탑재) | 절차서 완성, **Hugh 빌드 실행** |
| **W-4** | 2머신 relay E2E 실증 (Tailscale 무관 증명) | hugh-main online 필요 → 현재 BLOCKED |
| **(루프-토큰)** | forward/callback/pairing 토큰 비대칭 살아있으면 수정 | W-4 중 발견 시 |

### Wave 2 — 축소된 신뢰폴리시 (self-contained 유지, 사용자 수용)
4고객→공개 유통 전환 시점에. 외부의존 0.

| ID | 무엇 | self-contained 근거 |
|---|---|---|
| ~~**T2-1**~~ | ~~OV/Trusted Signing 인증서~~ → **MS Store 서명 의존** (사용자 결정 2026-06-21) | Store가 패키지 재서명 → 별도 코드사인 인증서·비용 불필요, SmartScreen은 Store 경로에서 무효. **BLOCKER #1 해소.** 단 Store 외 직접배포(.appinstaller/.msix)는 여전히 자체서명 → Store-우선 유통으로 전환 |
| **T2-2** | 로컬 파일 크래시 로그 (Sentry 아님) + panic hook | 오프라인 동작, 벤더 0. 사용자 첨부형 |
| **T2-3** | atomic release.ps1 (CI provider 의존 아님) | 단일 스크립트로 "업로드 1개 누락→링크 깨짐" 해결 |

### 후순위 (GA 블로커 아님, 별도)
- Python 사이드카(8071) Rust 포팅 — V25+. 명시적 번들로 "숨김" 해소가 우선.
- T2 MCP 툴 5개 "not ported" 스텁, `/api/nodes/discovered` 미구현 빈 UI.
- `/health` 가짜 disk_free_pct(0.0)·null relay.

---

## S급 기준 (해외 레퍼런스 비교, 2026-06-21 deep-research 확정)

레퍼런스 근거로 "이 제품의 S급 바"를 확정. 출처: Tailscale(온보딩), NetBird/ZeroTier(self-host mesh), Warp Oz/Sculptor/Open Interpreter/GitHub Agent HQ(AI 오케스트레이션), Microsoft/SSL.com(코드사인).

| 축 | S급 바 | MUSU 격차 | Wave |
|---|---|---|---|
| 온보딩 | Tailscale: 설치→2머신 ~2분, config 0, 중앙게이트 무 | "설치+같은계정=자동합류"(W-5) 맞춰감. relay 완전 은닉 + ~5분 목표(AI실행 단계 가산) 명시 | 0/1 |
| 신뢰 | SmartScreen 무경고 첫 실행 | 🔴 자체서명=강한 차단. **EV는 죽은 카드**(2024 instant-reputation loophole 폐지) | 2 |
| 기기 UX | 기기목록+live상태(online/working/last-seen/stable name) | cockpit S-tier 작업과 정합 | 0/2 |
| 업데이트 | Tauri 풀바이너리(delta 아님) + 버전 핸드셰이크 | G0-2 버전정합(완료) + cockpit↔bridge↔relay fail-fast 핸드셰이크 | 0/2 |

**계획 정정 (리서치 발견)**:
1. 🔴 **인증서: EV 아님, Azure Trusted Signing(~$120/yr) 우선** — EV loophole 죽음. **단 OQ#1: 한국 개인개발자 자격 미확인**(US/Canada만 확정). 막히면 OV(~$215/yr Sectigo/Certum) 폴백. **Wave 2 비용/접근을 정하기 전 해소 필수.** MSIX Store 경로가 서명 우회 가능한지도(OQ#3, Store ID 등록됨) 확인.
2. 🌊 **신규 "차별성 가시화" Wave** — 헤드라인을 "AI agent orchestration"(red ocean, Warp/Devin 약한 클론으로 보임) → **"네 물리 PC들을 하나로, SaaS 없이"**(blue ocean, 레퍼런스 누구도 3축 다 못 가짐: Tailscale=AI무, Open Interpreter/Sculptor=단일머신, Warp Oz=클라우드)로 재포지셔닝. 온보딩 카피+fleet view에 명시.
3. ✅ **버전 핸드셰이크가 실측 페인** — 리서치가 "cockpit 옛 MSIX 스폰" 사건([[reference-musu-cockpit-spawns-installed-msix]])을 짚음. G0-2가 그 토대. fail-fast "업데이트 필요" 핸드셰이크 후보.

**과투자 제외 (4고객 self-contained 규모)**: EV 인증서, delta 업데이트 인프라, SaaS 텔레메트리, 풀 CI 매트릭스, 멀티리전 relay. 코드사인만이 빠지면 안 되는 table-stakes.

**OQ (해소 필요)**: (1) Trusted Signing 한국 자격 → 서명 비용 결정. (2) relay가 엔드유저 첫 실행에 zero-config인가(서버측 토큰이 온보딩 경로로 새는가). (3) Store 경로가 서명 우회하는가.

---

## 진행 방식
- agent-team: Wave별 Critic→Builder→Auditor. Wave 0는 저위험이라 경량.
- 게이트: 번들 ID 확정(G0-1, 비가역)·W-3 빌드 설치·W-4 실기기·production deploy = 사용자. 나머지 자율 [[feedback-autonomous-loop]].
- 메모리: [[decision-musu-commercialization-wave-order]], [[feedback-self-contained-product]], [[feedback-no-python]].

## 검증 (무당짓 금지)
- Wave 0: 버전 단일소스 grep 일치 + 폼 POST 동작 + 번들 ID 사용자 확정.
- Wave 1: 실기기 2대 relay 왕복 실증 (없으면 BLOCKED 명시).
- Wave 2: OV 서명본 SmartScreen 무경고 설치 + 크래시 로그 파일 생성 + release.ps1 atomic 업로드.
