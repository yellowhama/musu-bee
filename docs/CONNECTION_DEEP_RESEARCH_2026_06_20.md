# 딥리서치 리포트: 개인 컴퓨터들의 AI 에이전트 연결 (2026 베스트 프랙티스)

> 질문: "여러 개인 컴퓨터에서 도는 AI 에이전트(claude code/codex)를 연결해, 한 머신의 AI가 다른 머신에 작업을 위임하고 결과를 받는 시스템"을 어떻게 설계하는 게 정답인가.
>
> 신뢰도: **높음** (공식 MCP 스펙 + Claude Code 공식 문서 + Tailscale 1차 자료 교차검증). musu 특정 적용은 일반 패턴 적용이라 **중**.

---

## 0. 핵심 결론 (먼저)

> **도달(transport)과 인증(auth)을 앱이 아니라 "네트워크 계층"으로 내려라.** Tailscale/headscale가 머신 신원·상호인증·암호화·NAT통과를 전부 처리하면 앱 토큰은 **5종 → 1종(또는 0종)**. AI는 그 위에 **MCP 단일 위임 툴**로 붙인다. A2A·자체 WAN relay·WebRTC는 이 규모에선 over-engineering.

→ 현재상태 리포트의 진단("토큰 5종 중복이 근본 원인")과 정확히 맞물린다. **musu 인프라(headscale `mesh.musu.pro`)는 이미 맞고, 토큰 중복만 문제.**

---

## 1. 머신 간 도달: Tailscale/headscale가 정답

| 방식 | self-contained | 개인 몇명·머신 몇대 | over-eng 위험 |
|---|---|---|---|
| Tailscale(관리형) | △ | ★★★★★ 무료 100대/3유저 | 낮음 |
| **headscale(자체호스팅)** | ★★★★★ | ★★★★ ($4/월 VPS) | 중 |
| 자체 WAN relay | ★★★★★ | ★★ | **높음** |
| WebRTC | ★★★ | ★ (CLI mesh 부적합) | **높음** |

- **self-contained 우선 = headscale.** Tailscale 제어 프로토콜 그대로 구현, 공식 클라이언트 무수정 연결. WireGuard가 키 교환·NAT통과·디바이스 인증 자동, 고정 `100.x.x.x` 주소, peer-to-peer(제어서버는 트래픽 못 봄).
- **자체 relay가 함정**: Tailscale이 하는 걸 다시 구현 = "되기만 하면 돼(배관 숨김)" 철학 위배.
- 메모리 정합: `feedback-self-contained-product`(외부 SaaS는 optionality), `decision-musu-v28`(Tailscale 빌려쓰기), `reference-musu-mesh-cloud-infra`(headscale 이미 보유).

---

## 2. 토큰 단순화: 5종 → 1종(또는 0종)

### 통찰: 토큰이 5종인 이유 = "앱 계층에서 머신 신원을 직접 인증하려 해서"

Tailscale/headscale를 쓰면 **머신 신원이 네트워크 계층에서 이미 암호학적으로 증명**된다:
- 설치 시 머신 키쌍 생성 → 개인키는 디바이스를 안 떠남 → control plane이 신원 검증.
- 접근제어는 ACL을 user/tag로(`tag:engineer can access tag:prod-db`).
- **→ 머신 간 mutual auth를 앱 토큰으로 다시 할 필요 없음.**

### 결정적 무기: `tailscale serve` + identity headers
- 로컬 서비스(`localhost:3000`)를 tailnet에 노출 → 자동 HTTPS/TLS, 안정 URL.
- 별도 인증 불필요 — tailnet 멤버십+ACL로 통제. 신원을 헤더로 전달(`Tailscale-User-Login`).
- ⚠️ **보안 규칙(공식 명시)**: identity header 인증 시 **서비스를 localhost에만 바인딩**(아니면 헤더 위조 가능).

### 권장 합치기
```
계층 1 (도달+머신인증): Tailscale/headscale → 토큰 0종 (WireGuard키+ACL)
계층 2 (앱 위임 인증):  단일 단명 토큰 1종  → Claude Code headersHelper로 connect 시 주입
```
- callback auth(`pattern-cross-machine-callback-auth`)도 tailnet 내부면 ACL이 흡수 → 0종.
- 앱 계층 1겹 더 원하면 `.mcp.json`의 `headersHelper`로 **연결 시점 fresh 토큰** 주입(정적 하드코딩 없음, 매 연결 실행, 10초 타임아웃).

---

## 3. AI를 transport에 붙이기: MCP 단일 위임 툴

### ⚠️ 가장 중요한 함정: `claude mcp serve`는 stdio 전용 → 네트워크로 바로 못 띄움
- `claude mcp serve`는 Claude Code 도구를 MCP로 노출하나 **stdio transport로 listen** = 로컬 전용. "설계상 네트워크로 다른 인스턴스 호출 불가." 원격 연결용 인증 없음.
- **→ cross-machine 위임은 stdio↔네트워크 브리지가 필수.** (musu V28 "claude=MCP only" thesis가 빠뜨리기 쉬운 함정 — 새 발견.)

### 검증된 브리지
- **supergateway** (Node/TS): MCP stdio 서버를 한 줄로 SSE/WS/Streamable-HTTP 노출. → **`feedback-no-python` 때문에 이걸 선택**.
- mcp-proxy (Python): 양방향 브리지(no-python 정책상 비선호).
- `tailscale serve`로 tailnet HTTPS 노출 → `claude mcp add --transport http`로 등록.

### 위임 패턴: `steipete/claude-code-mcp` (레퍼런스 구현 존재)
- **단일 툴 `claude_code`** 노출: `prompt`(필수), `workFolder`, `sessionId`, `permissionMode`.
- 동작: 툴 호출 → 별도 Claude Code 프로세스 자식 spawn → 독립 실행 → 결과 반환.
- **자체 auth 없음 — 로컬 CLI 자격증명에 의존.** → mesh가 auth 맡는 분업이 깔끔하게 성립.

### 조립도
```
[머신 A: Claude Code 오케스트레이터]
   │ claude mcp add --transport http machine-b https://machine-b.tailnet.ts.net/mcp
   ▼ (tailnet: WireGuard 암호화 + ACL 인증, 토큰 0종)
[머신 B] tailscale serve → localhost:8000 (HTTPS·localhost 바인딩)
   │ supergateway --stdio "claude mcp serve"  (stdio→HTTP)
   ▼ claude_code 툴 → 자식 Claude Code spawn → 작업 → 결과
```

### A2A는 지금 쓰지 마라
- "MCP 먼저, A2A는 조율 자체가 병목일 때만 의도적으로." 주요 코딩 IDE 중 native A2A 없음. MCP 설치 ~30분 vs A2A 수 주.
- A2A는 push webhook 서명·replay 보호가 **스펙 미정의** → 직접 메우면 토큰이 더 늘어남.
- **개인 몇명·단일 사용자 = MCP 위임으로 충분.** A2A는 cross-vendor/cross-org일 때만.

### MCP vs A2A 구간 구분 (중요)
- **MCP 정답 구간**: `AI ↔ 머신` (다른 머신을 "도구 묶음"으로 보고 tool 호출). V28 "MCP 인버전"이 정확히 여기.
- **MCP 비정답 구간**: `AI ↔ AI` (에이전트가 에이전트에게 위임). A2A 영역이나, 단일 사용자엔 (a)각 머신 claude를 도구 서버로만 노출 + 오케스트레이션은 한쪽이 client로 흡수 = MCP 일관 = YAGNI 정합.

---

## 4. 최소 핵심(MVP) 컴포넌트

| # | 컴포넌트 | 역할 | 도구 | 토큰 |
|---|---|---|---|---|
| 1 | mesh 네트워크 | 도달·머신인증·암호화·NAT통과 | **headscale**(self-contained) | 0 (WireGuard+ACL) |
| 2 | stdio↔HTTP 브리지 | `claude mcp serve` tailnet 노출 | **supergateway**(Node) + `tailscale serve` | 0 |
| 3 | 위임 MCP 서버 | `claude_code` 단일 툴 → 자식 spawn | steipete/claude-code-mcp 패턴 | 0~1 |
| 4 | 오케스트레이터 | 원격 머신을 MCP 서버로 등록·호출 | `claude mcp add --transport http` | #3 공유 |

**의도적으로 빼는 것(YAGNI)**: A2A, 자체 WAN relay, WebRTC 시그널링, 중앙 대시보드 백엔드. (cross-device "관찰"이 필요해지면 heartbeat 대시보드를 *별도* 추가 — 위임이 아니라 가시성 용도라 MVP 제외.)

---

## 5. musu 적용 요약 (메모리 대조)

1. **인프라는 이미 맞음** — `mesh.musu.pro`(headscale)가 컴포넌트 #1. caddy는 `tailscale serve`로 TLS 자동화 시 불필요해질 수도.
2. **토큰 5종 진짜 해법** — 앱 토큰으로 머신 인증을 재구현하는 걸 멈추고 **headscale ACL을 단일 소스로**. 5종 → 1종(또는 0종).
3. **V28과 정합** — "MCP 인버전·claude=MCP only" 방향이 바로 이 아키텍처. 단 `claude mcp serve` stdio 한계 → **supergateway 브리지 명시적 필요**(새 발견, 빠뜨리기 쉬움).
4. **non-Python 준수** — supergateway(Node) 선택.
5. **⚠️ WAN relay 직접구현 재검토**: 이전 결정(B-6 WAN relay 구현)은 이 리서치 결론(Tailscale/headscale가 이미 함, 자체 relay over-engineering)과 충돌. **메모리 `decision-musu-v28-fleet-as-one-device`(자체relay OUT, Tailscale 빌려쓰기)가 리서치와 일치** → Phase -1 전략게이트에서 "WAN relay 직접구현 vs headscale ACL" 재결정 필요.

---

## 6. 스펙 타이밍 주의

- MCP 2026 확정 스펙은 **2026-07-28**(현재 RC). stateless 전환, 헤더 라우팅(SEP-2243), 캐싱. `Mcp-Session-Id` 의존부를 격리해 둘 것.

---

## 출처 (핵심)
- [Connect Claude Code to tools via MCP](https://code.claude.com/docs/en/mcp) — transport·headersHelper·`claude mcp add`
- [Claude Code as MCP Server (ksred)](https://www.ksred.com/claude-code-as-an-mcp-server-an-interesting-capability-worth-understanding/) — stdio 전용·네트워크 불가
- [steipete/claude-code-mcp](https://github.com/steipete/claude-code-mcp) — `claude_code` 단일 위임 툴
- [A model for MCP connectivity (Tailscale)](https://tailscale.com/blog/model-for-mcp-connectivity-lee-briggs) — tailnet + 신원헤더 패턴
- [tailscale serve](https://tailscale.com/docs/features/tailscale-serve) — identity headers·localhost 바인딩 규칙
- [juanfont/headscale](https://github.com/juanfont/headscale) / [Headscale vs Tailscale](https://dev.to/selfhostingsh/headscale-vs-tailscale-self-hosted-control-plane-1h1f)
- [supercorp-ai/supergateway](https://github.com/supercorp-ai/supergateway)
- [A2A vs MCP (Augment)](https://www.augmentcode.com/guides/a2a-vs-mcp) — MCP 먼저, A2A 나중
- [Transports — MCP Spec](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports) / [2026 Roadmap](https://blog.modelcontextprotocol.io/posts/2026-mcp-roadmap/)
