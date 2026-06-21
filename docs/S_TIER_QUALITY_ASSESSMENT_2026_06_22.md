# MUSU S급 품질 평가 — 해외 레퍼런스 대비 (2026-06-22)

## 목적

/goal "퀄리티를 S급, 전세계 어디에 내놔도 꿀리지 않게"의 닫음 평가. 해외 레퍼런스 서비스 대비 musu의 현재 위치를 사실 기반으로 확정하고, S급까지의 잔여 격차를 명시한다. (deep-research 2026-06-21 + 코드 실측 + W-3 실기기 검증 종합.)

## S급 바 (레퍼런스 4축, 근거 출처)

| 축 | S급 레퍼런스 바 | musu 현재 | 격차 |
|---|---|---|---|
| **온보딩** | Tailscale: 설치→2머신 연결 ~2분, config 0, 중앙게이트 무 | "설치+같은계정 로그인=자동합류"(W-5), relay 은닉 | relay 완전 은닉 OK. ~5분 목표(AI실행 가산) 미측정 |
| **신뢰/배포** | SmartScreen 무경고 첫 실행 | MS Store 서명 의존 결정(2026-06-21) → Store경로 SmartScreen 무효 | 직접배포 .msix는 자체서명 → Store-우선 유통 전환 필요 |
| **기기 UX** | 기기목록+live상태(online/working/last-seen/stable name) | cockpit fleet view + `nodes` CLI | 정합 (S-tier cockpit 작업과 일치) |
| **업데이트/정합** | Tauri 풀바이너리 + 버전 핸드셰이크 | 버전 4소스 정합(G0-2) + fail-fast 게이트 | 버전 분열 차단 게이트 완성. cockpit↔bridge↔relay 핸드셰이크 후보 |

근거: Tailscale(tailscale.com/blog/how-tailscale-works), NetBird/ZeroTier(self-host mesh), Warp Oz/Sculptor/Open Interpreter/GitHub Agent HQ(AI 오케스트레이션), Microsoft/SSL.com(코드사인).

## Blue Ocean (차별성) — musu가 LEAD하는 지점

레퍼런스 누구도 3축을 다 못 가짐:
- **Tailscale** = mesh O, AI 오케스트레이션 X
- **Open Interpreter / Sculptor** = AI O, 단일 머신 (여러 물리 PC X)
- **Warp Oz** = AI 오케스트레이션 O, 클라우드 호스팅 (네 물리 PC X)

**musu = "네 물리 PC들을 하나로 묶어 AI가 가로질러 일하게, SaaS 없이"** — 세 축의 교집합. 이게 red-ocean(신뢰신호 table-stakes)이 아닌 blue-ocean 차별성. 헤드라인은 "AI orchestration"(red, 약한 Warp 클론으로 보임)이 아니라 이 교집합으로 가야 함.

## 이번 세션 품질 개선 (검증됨)

| 항목 | 결과 | 검증 |
|---|---|---|
| 버전 4소스 정합 + fail-fast 게이트 | rc.6 일치, drift 차단 | 양방향 테스트 |
| 번들 ID 통일 (com.blossompark.musu) | Store identity 정합 | DryRun + 설치 검증 |
| /health disk_free_pct 실측 | 가짜 0.0 → 43.27% 라이브 | 실기기 bridge 200 OK |
| auto-update IPC 관측성 | let _ = → warn 로깅 | cargo check |
| 버전게이트 2갭 (감사 발견) | bump 분열 + URL 사각 닫음 | code-reviewer 감사 + 양방향 테스트 |
| W-3 빌드+설치+검증 | blossompark 1.15.0.6 실행 | musu --version, mesh status |

독립 code-reviewer 감사: CI 그린에도 HIGH+MEDIUM 발견 → 근본 수정. health/auto_update/facade/Cargo/tauri = CLEAN.

## S급 잔여 격차 (정직)

**1. W-4 두 실기기 루프 미검증 (핵심)** — S급 정의 "두 실기기에서 루프가 돈다"의 직접 증명. hugh-main(2nd PC) offline으로 BLOCKED. 5중 증거(nodes/ping/route-explain/route-evidence/musu release_blocker)로 확정된 물리 게이트. sender 측은 실기기 실증 완료(route_evidence), receiver 측 왕복만 2nd PC 대기.

**2. Python 사이드카 (self-contained 위반)** — 제거는 1줄 수술(bridge/mod.rs:202), 무거운 로직 이미 네이티브. fallback 측정 로깅 추가됨(2b903651) → 실세션 PROXIED 인벤토리 수집 후 포팅. GA 후순위.

**3. 직접배포 자체서명** — Store-우선 유통으로 SmartScreen 회피. 직접 .msix 경로는 Store 출시 후 deprecate 후보.

## 결론

코드/빌드/설치/검증/감사 토대 = **완료**. blue-ocean 차별성(self-contained 물리 PC fleet)은 레퍼런스 대비 명확히 LEAD. S급 핵심 증명(두 실기기 루프)은 **hugh-main 전원이 유일 직접 경로** — 나머지 전부 준비됨. 신뢰/배포는 Store 서명 결정으로 BLOCKER 해소.

**무당짓 안 함 원칙 준수**: supabase(import-safe 의도)·relay:None(relay-rs 의존)·doctor poller(설계 의도)는 패널/조사 제안이 코드 현실과 안 맞아 보존/revert. 거짓 디자인 증거 우회 거부.
