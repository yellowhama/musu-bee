# 마스터 기획안: AI↔musu1↔musu2↔AI 연결 재설계 (2026-06-20)

> 목표(/goal): "이 연결 하나만 제대로 살리고, 쓸데없는 건 다 덜어내라."
> 근거: `CONNECTION_CURRENT_STATE_2026_06_20.md`(현재상태) + `CONNECTION_DEEP_RESEARCH_2026_06_20.md`(딥리서치) + Phase -1 전략게이트(business-panel 만장일치).

---

## §0 Phase -1 전략게이트 결과 (YELLOW — thesis 건전, 아키텍처 축소)

business-panel 4인 **만장일치**: 경로 A(headscale ACL) 채택, 경로 B(WAN relay 직접구현) 폐기.
- Christensen: job은 "작업 위임이 인증돼 도달"이지 relay가 아님. A는 이번 주 출시, B는 relay부터.
- Taleb: "매번 토큰 에러" = 자초한 fragility. headscale는 SaaS 아니라 내 VPS 바이너리. Via negativa.
- Kim&Mauborgne: relay 재구현 = red ocean. ERRC로 앱토큰+relay 제거.
- Drucker: 자체 relay = 6개월-후회 scope creep. v28이 이미 옳게 폐기한 걸 뒤집지 마라.

→ 메모리 `decision-musu-connection-headscale-acl` 기록됨.

## §1 한 줄 thesis

**도달+인증을 앱이 아니라 네트워크 계층(headscale ACL, 이미 보유한 `mesh.musu.pro`)으로 내린다. 그러면 토큰 5~6종이 1종(또는 0종)이 되고, 그 위에 MCP 단일 위임 툴(`claude_code`, steipete 패턴)로 AI↔머신을 붙인다. 자체 relay·잉여 토큰·A2A는 전부 삭제.**

전제 실측 확인됨: `claude mcp serve`(stdio) 존재, `claude mcp add --transport http --header` 지원, node v24/npx(supergateway) 가능.

---

## §2 목표 상태 아키텍처

```
[머신 A: Claude Code 오케스트레이터]
   │ claude mcp add --transport http machine-b https://machine-b.<tailnet>.ts.net/mcp
   ▼ (headscale tailnet: WireGuard 암호화 + ACL mutual auth, 앱토큰 0종)
[머신 B]
   tailscale serve → localhost:PORT  (HTTPS 자동, localhost 바인딩만 — 헤더위조 방지)
   │ supergateway --stdio "claude mcp serve"   (stdio→Streamable HTTP)
   ▼ claude_code 툴 → 자식 Claude Code spawn → 작업 실행 → 결과 반환
```

- **인증**: headscale ACL(WireGuard 키). 앱 계층 토큰 1겹 더 원하면 `.mcp.json` `headersHelper`로 connect 시점 단명 토큰(정적 하드코딩 없음).
- **도달**: headscale가 NAT통과·암호화·고정 100.x IP 제공. off-network도 headscale DERP로 도달.

---

## §3 작업 분해 (subtraction 우선, /loop 순차)

### C-1. 토큰 단일화 (HIGH — 근본원인 수정)
- 4개 토큰 해석기(`read_bridge_token`/`read_control_token`/`cloud::load_token`/`p2pControlAuth`)를 single source로.
- cross-machine forward/callback이 자기 토큰 보내는 구조 제거 → headscale 신원 기반(앱 토큰 미전송) OR 단일 공유 단명 토큰.
- **검증**: 2머신에서 route → delegate → callback이 401 없이 왕복. 현재 실측(`musu nodes`로 hugh_second+hugh-main 보임)을 베이스라인으로.
- 파일: `musu-rs/src/bridge/handlers/forward.rs`, `auth.rs`, `config.rs`, `install/token.rs`, `bridge/handlers/pair.rs`.

### C-2. MCP 위임 경로 (HIGH — 연결의 실체)

**★ 재정의 (2026-06-20 Explore 발견): supergateway 불필요.** musu가 딥리서치 아키텍처를 이미 자체 구현함:
- "supergateway가 claude를 HTTP MCP 노출" → `control/http_server.rs`가 bridge 포트에 HTTP MCP(`/mcp/v1/messages`, `--mcp-bind-external`) 이미 mount.
- "claude_code 위임툴" → `control/mod.rs:151-173` `delegate_task`/`get_task_result` MCP 툴 이미 존재(stdio+HTTP).
- "머신 B claude spawn" → forward(`forward.rs:594`)→runner→`claude --print`(headless) 이미 존재.
- musu 자체 경로는 dedup·route evidence·workspace zip까지 갖춤 → supergateway 교체는 **기능 손실**.
- **판단: (A) musu 자체 경로 채택. supergateway = 순수 중복, 새 의존 0개.** "쓸데없는거 덜어내라"에 부합.

**C-2 = 운영 갭 메우기** (코드 버그 아닌 설정 2개):
- **C-2a bind**: 기본 `127.0.0.1:랜덤포트`(`config.rs:118-124`) → 원격 도달 불가. mesh join 시 tailnet IP + 고정 포트(8070) 자동 설정.
- **C-2b adapter**: 기본 codex 우선(`tasks.rs:139-147`) → claude 안 골릴 수 있음. cross-machine 위임 adapter 명시 보장.
- **검증**: 머신 A `delegate_task` → 머신 B claude spawn → 결과. 실기기 2대 E2E(없으면 BLOCKED).
- 통합 지점: `control/mod.rs:151-173`, `control/http_server.rs`, `tasks.rs:217-479`, `forward.rs:484-620`, `config.rs:118-124`.

### C-3. 잘라내기 (subtraction — 사용자 "쓸데없는거 덜어내라")
- `rendezvous.rs` WAN relay not_implemented 경로 **삭제**(완성 X).
- 잉여 토큰 4종 제거. pairing 토큰교환(버려지는) 로직 제거.
- A2A/AI↔AI 흔적 제거(있으면). 자체 NAT/STUN/TURN/DERP 코드 제거.
- relay payload/lease/transport 미사용 배선 정리(`p2pRelayPolicy.ts`, `route_evidence.rs` relay 부분).

### C-4. cockpit 진입점 정합 (MED)
- cockpit pre-send 게이트가 online만 보고 auth 미검증(`main.js:4004`) → 위임 가능 여부까지 반영.
- 웹 workspace는 이미 게이트됨(MUSU_WORKSPACE_UI off) → cockpit이 유일 진입점. cross-machine 위임 UI가 실제 동작하는지 확인.

### C-5. node-join UX (MED — Drucker 경고: 병목 이동)
- 토큰 5종→1종이면 node-join이 유일 온보딩 게이트가 됨. `musu mesh join-account` 흐름을 견고하게.
- 현재 `local tailnet ip: [none]`(이 머신 join 안 됨) 해결.

---

## §4 검증 (무당짓 금지 — 매 단계 실측)
- 매 단계: `musu nodes/mesh/relay` CLI 직접 + 2머신 실제 route/callback 왕복.
- C-1: 토큰 통합 후 cross-machine 401 사라짐을 실측(현재 `blockers`에 토큰 관련 전부 해소).
- C-2: 실기기 2대 위임 E2E. 1대뿐이면 BLOCKED 명시(가짜 통과 금지).
- 빌드: Rust는 메모리-안전 빌드(`build-msix.ps1` 이미 수정됨, RUST_MIN_STACK).

## §5 진행 방식
- agent-team: C-1/C-2는 Researcher→Critic→Builder→Auditor. C-3은 삭제라 Critic(안전 절단면) 중요.
- /loop 순차: C-1(토큰) → C-2(MCP 위임) → C-3(잘라내기) → C-4/C-5.
- Const VII(main 머지)·production deploy·Const III(schema)만 사용자 게이트.

## §6 열린 질문 (구현 중 결정)
1. C-1에서 "앱 토큰 0종(순수 headscale ACL 신원)" vs "단일 단명 토큰 1종(headersHelper)" 중 어느 레벨까지? — Builder가 forward/callback 실코드 보고 최소 변경으로.
2. supergateway를 musu가 번들 vs 사용자 설치(installer optionality)? — feedback-self-contained 정합 위해 번들 우선 검토.
3. 2머신 E2E를 위한 실기기 — hugh-main이 실제 도달 가능한지 먼저 확인.
