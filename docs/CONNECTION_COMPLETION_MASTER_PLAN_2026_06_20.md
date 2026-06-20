# 마스터 플랜: AI↔musu1↔musu2↔AI 연결 완성 (2026-06-20 v2)

> 목표(/goal): "이 연결 하나만 제대로 살린다." WAN relay 서버 라이브 켜짐(musu.pro lease_issued:true 실증). 이제 머신 레벨 왕복 완성 + 사용자가 배관 안 하게.
> 근거: 3개 Explore 전수조사 (cockpit UX / relay 머신레벨 / 미완 인벤토리). 진행: `project-musu-relay-progress` 메모리.

---

## §0 현재 상태 (전수조사 확정)

**완료 (main 머지 + 라이브):**
- C-1 mesh bearer 토큰 통합 (cross-machine 401 해소)
- R-1 relay lease 게이트 A/B 분리 (musu.pro lease_issued:true 라이브)
- R-2 poller 기본 ON
- 서버 relay env (ENABLED/URL/ENTITLEMENT) + KV(vercel_kv release-grade 확인)

**relay 왕복 — 절반만 완성 (핵심 발견):**
- ✅ task 전달: sender→KV큐(`POST musu.pro/api/v1/p2p/relay/payload`)→receiver poller(`relay_payload.rs:424` 기본ON, `bridge/mod.rs:196` 부팅시작)→`accept_forwarded_task`→claude spawn→mark_delivered. **done.**
- ❌ **결과 callback이 relay를 안 탐**: `runner.rs:356-401` callback이 sender의 `advertised_bridge_http_url`로 **직접 HTTP만**. NAT/loopback sender는 결과 못 받음. 역방향 relay payload kind 없음.
- ❌ **sender hard-fail**: `forward_to_peer_with_retry`가 relay 큐잉 성공해도 `Err` 반환 → `tasks.rs:410`/`run.rs:240`이 task를 실패 마감 → relay로 실행돼도 sender엔 실패 표시.

**2개 P0 블로커:**
- BLOCKER-A: relay 코드가 **설치 바이너리에 없음**. 최신 MSIX는 rc.4 기반(relay 이전). VERSION=rc.7. → 재빌드+재설치 필요.
- BLOCKER-B: 서버 KV — **이미 해결**(vercel_kv release-grade, lease 라이브 성공이 증명).

**cockpit "Add PC" 버그:** 자동 join(`maybeAutoJoinAccountMesh` main.js:2420, 로그인시 트리거)은 이미 동작. 그런데 `add-pc-panel`(index.html:207-272)이 옛 docker/device-pass 수동 5단계를 별도로 보여줌 = "저걸 누가 하냐". step 1-4가 중복/버그.

---

## §1 작업 분해 (사용자 결정: 완전자동 연결 우선, /loop 순차)

### W-1. 역방향 relay callback (HIGH — 왕복 완성, 사용자 결정)
- **task_callback_envelope** relay payload kind 추가(현재 `forwarded_task_envelope` 하나뿐, `forward.rs:255`).
- receiver가 결과를 sender에 직접 POST 실패 시 → callback을 KV 큐에 put → sender의 poller가 자기 앞 callback을 drain → 원본 task에 결과 반영.
- 양방향 대칭: 기존 forwarded_task drain 경로(`relay_payload.rs`) 재사용, kind 분기 추가.
- **검증**: 단위(callback envelope 직렬화/검증) + 통합(sender loopback → relay task → receiver 실행 → relay callback → sender 결과 수신).
- 파일: `forward.rs`(kind, envelope), `relay_payload.rs`(drain 분기), `runner.rs:356-401`(callback relay fallback), `cloud/mod.rs`(submit/claim callback payload), 서버 payload route(kind 허용).

### W-2. sender 상태 정합 (HIGH — relay 큐잉=실패 아님)
- `tasks.rs:410`/`run.rs:240`이 relay 큐잉 성공(`e.relay_fallback` 존재)을 **pending/relayed**로, hard-fail 아님으로 처리.
- relay로 넘어간 task는 "relayed, 결과 대기" 상태 → W-1 callback이 오면 완료로.
- 파일: `tasks.rs`, `run.rs`, task 상태 enum.

### W-3. rc.7 재빌드 + 재설치 (P0 — BLOCKER-A)
- W-1/W-2 머지 후 MSIX 재빌드(메모리-안전 빌드 자동, build-msix.ps1). desktop-latest release 자산 교체.
- 이 머신 + hugh-main 양쪽 재설치.

### W-4. 2머신 E2E (HIGH — 진짜 검증)
- 양 머신 로그인 → cockpit에서 remote order → relay drain → relay callback → 결과 수신. **Tailscale 무관(KV 경유) 확인.**
- 실기기 2대 필요. hugh-main online 필요.

### W-5. cockpit "Add PC" UX 교체 (P1 — 사용자 "저걸 누가 하냐")
- `index.html:207-272` step 1-4(docker/pass) 제거 → "다른 PC에 MUSU 설치+같은 계정 로그인 → 자동으로 fleet에 나타남" 안내 1블록.
- 핸들러(`runMeshBootstrap`/`runStartControlHost`/`runDeviceAddPassIssue`/`runMeshJoin`) dead code화.
- 유지: mesh-status-card, 자동 join(손대지 말 것). 재사용: index.html:253/266 문구.

### W-6. relay 통합 테스트 (P1 — 회귀 방지)
- 2-bridge 픽스처로 sender→relay→receiver→callback 왕복 자동 검증.
- 파일: `musu-rs/tests/` 신규.

### (보류) C-2a bind, C-3 stamp, B-3b/B-7
- C-2a(bind 자동화): relay는 bind 무관 → P2 강등.
- C-3 stamp: relay 살아있으니 not-implemented 상수는 "QUIC release-grade 보류" 의미전환 → 무해, 안 건드림.
- B-3b/B-7: 연결 본류 밖, 후순위.

---

## §2 진행 방식 (4-스택)
- agent-team: W-1/W-2는 인증·상태 핵심 → Critic(security/system-architect) 필수. Builder→Auditor.
- /loop 순차: W-1(callback relay) → W-2(상태) → W-3(빌드) → W-4(E2E) → W-5(UX) → W-6(테스트).
- Const VII(main 머지)·production deploy·새 빌드 설치만 사용자 게이트.

## §3 검증 (무당짓 금지 — 매 단계 실측)
- W-1/W-2: 단위 + cargo test. relay callback 직렬화 검증.
- W-4: 실기기 2대. 없으면 BLOCKED 명시(가짜 통과 금지). relay 경로가 tailnet 없이 도는지가 핵심 증명.
- W-5: cockpit 빌드 후 browse/스크린샷으로 Add PC 패널 확인.
- 매 relay 변경 후 `musu relay status`/`relay transport` blockers 실측.

## §4 열린 질문 (구현 중)
1. callback payload의 인증: forwarded_task처럼 KV owner-scope + sha256 바인딩 재사용 vs mesh bearer.
2. callback relay를 "직접 실패 시에만" vs "always relay" — 직접 우선, relay fallback이 대칭.
3. hugh-main online + 양쪽 재설치 타이밍(W-4는 사용자 머신 의존).
