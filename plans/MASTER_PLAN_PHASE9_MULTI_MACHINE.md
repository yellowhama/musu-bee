# MUSU Phase 9 — Multi-Machine Zero-Config Orchestration
> 작성: 2026-04-15 | 목표: 수동 설정 없이 두 대 이상의 머신을 MUSU로 다룬다

---

## 1. 현재 문제 (Why)

페어링은 된다. 라우팅 코드도 있다.
근데 실제로 두 머신에서 에이전트를 나눠 쓰려면 **nodes.toml을 손으로 편집**해야 한다.

```toml
# 이걸 지금은 직접 써야 함
[[mesh.agent_assignments]]
agent = "engineer"
node = "main-pc"
```

페어링 후에도 이 설정이 자동으로 안 생긴다.
→ 이것 하나 때문에 "그냥 된다"가 아니라 "설정하면 된다"에 머물고 있다.

---

## 2. 리서치 결과 요약

| 기술 | 관련도 | 핵심 인사이트 |
|------|--------|--------------|
| **A2A Agent Card** | ★★★★★ | `/.well-known/agent.json` — 에이전트 능력을 HTTP로 광고. Linux Foundation 표준. LangGraph/Amazon Bedrock 이미 구현 |
| **AgentAnycast** | ★★★★★ | mDNS + skill routing + E2E 암호화. 우리가 만들려는 것과 거의 동일한 OSS |
| **mDNS/Zeroconf** | ★★★★★ | 같은 네트워크(Tailscale 포함)에서 설정 없이 자동 노드 발견 |
| **Consul Gossip** | ★★★☆☆ | 완전 자동 분산 발견. 오버킬. Tailscale이 네트워크 레이어를 이미 해결함 |
| **AutoGen gRPC Runtime** | ★★★☆☆ | 중앙 host 필요 — MUSU의 P2P 철학과 안 맞음 |
| **Durable Swarm (DBOS)** | ★★★★☆ | SQLite에 task 상태 저장 → 재시작 시 자동 재개. 50줄 구현 가능 |

**핵심 결론**: A2A Agent Card + mDNS = zero-config 멀티머신. 외부 의존성 없음.

---

## 3. 아키텍처 결정

```
┌─────────────────────────────────────────────────────┐
│                  musu-bee UI                        │
│  NodePanel: 자동 발견된 노드 목록 + 1-click 페어링  │
└────────────────────┬────────────────────────────────┘
                     │ HTTP
┌────────────────────▼────────────────────────────────┐
│              musu-bridge (각 머신)                  │
│                                                     │
│  /.well-known/agent.json  ← A2A Agent Card          │
│  /api/admin/pair          ← 페어링 + 자동 배치      │
│  /api/route               ← 메시지 라우팅           │
│  /health                  ← 헬스체크               │
│                                                     │
│  mDNS: _musu-bridge._tcp.local 공표                 │
│  mDNS: 같은 Tailscale 네트워크 스캔                 │
└─────────────────────────────────────────────────────┘

Discovery Flow:
  musu-bridge 시작
    → mDNS로 자신 공표 (_musu-bridge._tcp.local)
    → 같은 네트워크의 다른 노드 자동 발견
    → 발견된 노드의 /.well-known/agent.json 가져옴
    → 에이전트 목록 파악 → agent_assignments 자동 생성
    → nodes.toml 업데이트

Routing Flow (현재와 동일, 자동 설정만 추가):
  musu-bee → POST /api/route (channel="engineer")
    → musu-bridge: agent_assignments["engineer"] = "main-pc"
    → HTTP forward to main-pc:8070/api/route
    → main-pc 에이전트 응답 → 반환
```

---

## 4. Phase 계획

### Phase 9A — A2A Agent Card + 자동 배치 (최우선)

**목표**: 페어링 후 TOML 손 편집 없이 라우팅 작동

**구현**:
1. `musu-bridge`: `GET /.well-known/agent.json` 엔드포인트 추가
   ```json
   {
     "name": "main-pc",
     "description": "MUSU Bridge Node",
     "url": "http://100.121.211.106:8070",
     "version": "0.2.0",
     "capabilities": {
       "agents": [
         {"id": "engineer", "description": "Software engineer agent"},
         {"id": "qa", "description": "QA agent"}
       ]
     }
   }
   ```

2. `mesh_router.py`: 페어링 후 자동 배치 로직
   - `auto_assign_from_card(remote_name, remote_agents)` — 겹치지 않는 에이전트 자동 배치
   - 이미 배치된 에이전트는 건드리지 않음 (기존 설정 존중)
   - `_write_toml()` 호출 시 auto-assign도 함께 저장

3. `NodePanel.tsx`: 페어링 완료 후 배치 현황 표시
   - "engineer, qa → main-pc 자동 배치됨" 확인 배너
   - 수동 오버라이드 버튼 (나중에 구현)

**예상 변경 파일**:
- `musu-bridge/server.py` — Agent Card 엔드포인트
- `musu-bridge/mesh_router.py` — auto_assign_from_card()
- `musu-bridge/handlers.py` — pair_with_node()에 auto-assign 호출
- `musu-bee/src/components/NodePanel.tsx` — 배치 결과 표시

**결과**: 페어링 클릭 → 자동으로 에이전트 배치 → 메시지 라우팅 작동

---

### Phase 9B — 헬스 모니터링 + 폴백 라우팅

**목표**: 원격 노드가 꺼져도 에러 대신 로컬로 자동 폴백

**구현**:
1. `MeshRouter`: 노드별 헬스 캐시 (10초 TTL)
   ```python
   _health_cache: dict[str, tuple[bool, float]]  # node_name → (is_alive, checked_at)
   ```

2. `route_chat()`: 원격 라우팅 전 헬스 체크
   ```python
   if not await mesh.is_healthy(node):
       logger.warning("node %r unhealthy — falling back to local", node)
       # Fall through to local handler
   ```

3. `NodePanel.tsx`: 실시간 헬스 dot (초록/빨강/회색)
   - 현재는 15초마다 /api/nodes를 폴링하는데, 여기에 헬스 상태 반영

**결과**: main-pc 꺼짐 → engineer 채널 메시지가 로컬 fallback으로 처리됨 (또는 명확한 "unavailable" 에러)

---

### Phase 9C — mDNS Zero-Config Discovery

**목표**: 같은 Tailscale 네트워크에 있으면 IP 입력 없이 자동 발견

**구현**:
1. `musu-bridge`: Python `zeroconf` 라이브러리
   ```python
   # 시작 시:
   ServiceInfo("_musu-bridge._tcp.local.", "main-pc._musu-bridge._tcp.local.",
               addresses=[socket.inet_aton(tailscale_ip)], port=8070,
               properties={"version": "0.2.0", "node": "main-pc"})
   ```

2. `musu-bridge`: 피어 스캐닝 (30초 간격)
   - 발견된 노드 → Agent Card fetch → nodes.toml 업데이트 제안

3. `musu-bee NodePanel`: "Discovered (mDNS)" 섹션
   - musu.pro 토큰 없어도 LAN에서 자동 발견된 노드 표시

**의존성**: `pip install zeroconf` (Python stdlib 아님, 경량)

**결과**: 같은 Tailscale 네트워크에 musu-bridge 켜면 → 자동으로 보임 → 1-click 페어링

---

### Phase 9D — Durable Task Execution

**목표**: 에이전트 실행 중 브릿지 재시작해도 태스크 유실 없음

**구현**:
1. SQLite에 `tasks` 테이블 추가 (musu-core LocalBackend)
   ```sql
   CREATE TABLE tasks (
     id TEXT PRIMARY KEY,
     channel TEXT,
     sender_id TEXT,
     input TEXT,
     status TEXT,  -- 'pending' | 'running' | 'done' | 'failed'
     node TEXT,
     output TEXT,
     created_at TEXT,
     completed_at TEXT
   );
   ```

2. `route_chat()` wrapping: 실행 전 `pending` 기록 → 완료 시 `done` 업데이트

3. `server.py` lifespan: 시작 시 `pending` 태스크 재 dispatch

**결과**: 브릿지 재시작 → 미완료 태스크 자동 재개

---

## 5. 구현 순서 (ROI 기준)

```
Phase 9A (Agent Card + 자동 배치)    ← 지금 당장, 가장 중요
    ↓ 완료 후
Phase 9B (헬스 모니터링 + 폴백)     ← 신뢰성 필수
    ↓ 완료 후
Phase 9C (mDNS Discovery)           ← DX 개선, 의존성 추가 있음
    ↓ 완료 후
Phase 9D (Durable Tasks)            ← 프로덕션 신뢰성
```

---

## 6. 파일 변경 요약

| 파일 | Phase | 변경 유형 |
|------|-------|---------|
| `musu-bridge/server.py` | 9A | `GET /.well-known/agent.json` 추가 |
| `musu-bridge/mesh_router.py` | 9A, 9B | auto_assign, health_cache 추가 |
| `musu-bridge/handlers.py` | 9A, 9B | pair_with_node 수정, fallback 추가 |
| `musu-bridge/discovery.py` | 9C | 신규 — mDNS 공표 + 스캔 |
| `musu-bridge/server.py` | 9C | lifespan에 discovery 추가 |
| `musu-core/backends/local.py` | 9D | tasks 테이블 추가 |
| `musu-bridge/handlers.py` | 9D | route_chat() durability wrapping |
| `musu-bee/src/components/NodePanel.tsx` | 9A, 9B, 9C | 자동 배치 확인, 헬스 dot, 발견 섹션 |
| `musu-bee/src/app/api/nodes/route.ts` | 9C | discovered nodes 프록시 |

---

## 7. 레퍼런스

- `references/agentanycast/` — mDNS + skill routing 구현 레퍼런스
- `references/A2A/` — Agent Card JSON 스펙
- `references/durable-swarm/` — task durability 패턴
- [A2A Spec](https://a2a-protocol.org/latest/specification/)
- [AgentAnycast GitHub](https://github.com/AgentAnycast/agentanycast)

---

## 8. 정성적 목표 점수

| Phase | 현재 | 목표 |
|-------|------|------|
| 9A 완료 후 | 83/100 | 91/100 |
| 9B 완료 후 | — | 94/100 |
| 9C 완료 후 | — | 96/100 |
| 9D 완료 후 | — | 98/100 |

**98/100의 의미**: "그냥 된다." 설정 없이 켜면 옆 머신이 보이고, 에이전트가 자동으로 분산되고, 죽어도 살아나는 시스템.
