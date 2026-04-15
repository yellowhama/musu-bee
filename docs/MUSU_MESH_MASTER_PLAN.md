# MUSU Mesh — Master Plan
> 작성: 2026-04-16 | 상태: 계획 (Phase 0 완료, Phase 1 진행 예정)

---

## 왜 만드는가

**문제:** 두 대의 데스크탑 + 노트북을 Tailscale로 연결하려 했으나, WSL2 환경에서
TCP 포트가 차단되어 `curl http://100.121.211.106:8070/health → Connection refused`.
VPN 에 의존하면 서버비 폭발 (relay 경유 트래픽), Tailscale은 고객이 설치해야 함.

**목표:** musu-bridge 노드들이 **Tailscale 없이** 서로 직접 연결되고,
중앙 서버는 IP 주소 교환(signaling)만 하며 데이터는 직접 흐른다.

**설계 원칙:**
- **대칭 P2P** — host/client 구분 없음, 모든 노드는 동등한 peer
- **Nebula lighthouse 패턴** — musu.pro가 등대 역할 (IP만 저장, 트래픽은 절대 통과 안 함)
- **로컬 캐시** — 한 번 연결된 peer는 peers.json에 저장, musu.pro 없어도 재연결 가능
- **LAN 우선** — 같은 네트워크면 mDNS로 직접 연결 (musu.pro 불필요)
- **고객 친화적** — Tailscale 불필요, 설치 파일 하나로 동작

---

## 현재 상태 (Phase 0 — 완료)

| 컴포넌트 | 상태 | 위치 |
|---------|------|------|
| `registry.py` — musu.pro 하트비트 (POST /api/v1/nodes/register) | ✅ 작동 | `musu-bridge/registry.py` |
| `discovery.py` — mDNS LAN 탐색 | ✅ 작동 | `musu-bridge/discovery.py` |
| `mesh_router.py` — nodes.toml 기반 HTTP 라우팅 | ✅ 작동 (수동 설정) | `musu-bridge/mesh_router.py` |
| `sync_engine.py` — 30초 pull 기반 동기화 | ✅ 작동 | `musu-bridge/sync_engine.py` |
| musu.pro nodes API — 노드 등록/조회 | ✅ 작동 | `vibecode-town/src/app/api/v1/nodes/` |
| `musu-connectsd` — QUIC 핸드셰이크 테스트 | ✅ 격리 테스트 통과 | `musu-connects/apps/musu-connectsd/` |
| musu-connects-core — PeerRecord, RouteSyncService, SessionRegistry | ✅ 구현됨 (미통합) | `musu-connects/crates/musu-connects-core/` |

**Phase 0에서 빠진 것:**
- peers.json 없음 → 연결 끊기면 peer 잊어버림
- musu.pro에서 peers 자동 조회 없음 → nodes.toml 수동 작성 필요
- QUIC가 musu-bridge에 연결 안 됨 → HTTP만 사용
- LAN mDNS 탐색은 있지만 mesh_router에 자동 반영 안 됨

---

## 아키텍처 다이어그램

```
[ 노트북 (카페) ]          [ musu.pro (등대) ]
  musu-bridge :8070   ←→  /api/v1/nodes/register  (IP 등록, 5분마다)
                      ←→  /api/v1/nodes            (peer IP 조회)

        ↕ QUIC (직접, relay 없음)

[ 데스크탑 A (집) ]        [ 데스크탑 B (집) ]
  musu-bridge :8070    ←→   musu-bridge :8070
  musu-connectsd :4433  ←→  musu-connectsd :4433
        ↑ mDNS (LAN)  ↓
        같은 공유기면 직접 연결
```

**flow 요약:**
1. 노드 시작 → musu.pro에 `{node_name, public_url: "http://<공인IP>:8070"}` 등록
2. peers.json에서 알려진 peer IP 로드
3. 연결 실패하면 musu.pro에서 peer IP 조회 → peers.json 업데이트
4. QUIC 직접 연결 (4433 포트)
5. 같은 LAN이면 mDNS 경유 직접 연결

---

## 구현 Phase 별 계획

---

### Phase 1: Cloud Peer Discovery (우선순위 1)
> **목표:** nodes.toml 수동 설정 없이 musu.pro에서 자동으로 peers를 발견하고 peers.json에 캐시

**변경 파일:**
- `musu-bridge/registry.py` — GET /api/v1/nodes 조회 추가
- `musu-bridge/peer_cache.py` (신규) — peers.json 읽기/쓰기
- `musu-bridge/server.py` — lifespan에서 peer discovery 초기화
- `musu-bridge/mesh_router.py` — 수동 nodes.toml 대신 peer_cache에서 노드 로드

**peers.json 구조:**
```json
{
  "version": 1,
  "peers": [
    {
      "node_name": "hugh-main-1",
      "public_url": "http://1.2.3.4:8070",
      "last_seen": "2026-04-16T10:00:00Z",
      "source": "musu.pro"
    }
  ]
}
```

**Discovery 흐름:**
```
startup
  → load peers.json
  → try connect to each peer (/health)
  → on fail: fetch musu.pro /api/v1/nodes
  → update peers.json with new IPs
  → mesh_router.add_node() for each live peer
```

**수락 기준:**
- `bash scripts/connect-remote-node.sh` 없이도 peer 자동 발견
- musu.pro에서 받은 peer로 `mesh_router.is_remote()` 동작
- 재시작 후에도 peers.json에서 peer 재연결

**완료:** `peer_cache.py` 신규, `registry.py` + `server.py` 업데이트 (2026-04-16)

---

### Phase 2: QUIC Transport (우선순위 2)
> **목표:** HTTP mesh routing을 QUIC으로 교체, NAT traversal 지원

**설계 결정:**
- musu-connects-core QuicProvider는 mock (실제 QUIC I/O 없음) → 직접 사용 불가
- `musu-connectsd bridge-proxy` 신규 명령어로 minimal QUIC 터널 구현
- Python은 HTTP 그대로 사용 (대상만 127.0.0.1:9443으로 변경)

**흐름:**
```
Python mesh_router.forward()
  → POST http://127.0.0.1:9443/forward (QUIC sidecar)
  → QUIC UDP 4433 → remote musu-connectsd
  → POST http://127.0.0.1:8070/api/route (remote bridge)
```

**변경 파일:**
- `musu-connects/apps/musu-connectsd/src/main.rs` — bridge-proxy 명령어 추가 (~200줄)
- `musu-connects/apps/musu-connectsd/Cargo.toml` — axum, reqwest 추가
- `musu-bridge/mesh_router.py` — forward() QUIC 우선 시도 + HTTP fallback
- `musu-bridge/config.py` — quic_port, quic_proxy_url 추가
- `scripts/start-bridge.sh` (신규) — musu-connectsd + musu-bridge 통합 시작

**TLS 전략:** rcgen 자체 서명 인증서, 클라이언트 검증 skip (Phase 3에서 cert pinning)

**수락 기준:**
- `delegate_task` MCP 호출 시 QUIC 경로 사용 (로그에 "quic:" 확인)
- main-pc ↔ second-pc 직접 연결 (Tailscale 불필요)
- QUIC 실패 시 HTTP fallback 동작

**세부 플랜 파일:** `/home/hugh51/.claude/plans/stateful-popping-tulip.md` (완성됨)

---

### Phase 3: LAN Fast Path (우선순위 3)
> **목표:** mDNS로 탐색한 LAN peer를 자동으로 mesh_router에 등록

**현재:** discovery.py가 mDNS peer를 탐색하지만 mesh_router에 반영 안 됨
**목표:** LAN peer 탐색 → 자동으로 mesh_router에 추가 → QUIC LAN 직접 연결

**변경 파일:**
- `musu-bridge/discovery.py` — 탐색된 peer를 callback으로 전달
- `musu-bridge/server.py` — discovery callback → mesh_router.add_node()
- `musu-bridge/mesh_router.py` — LAN peer에 우선순위 부여

**수락 기준:**
- 같은 공유기의 두 노드가 musu.pro 없이 자동 연결
- LAN 연결이 WAN 연결보다 지연 낮음 (RTT 확인)

**세부 플랜 파일:** `docs/plans/2026-04-16-phase3-lan-fastpath.md` (Phase 3 시작 시 생성)

---

### Phase 4: musu.pro 공인 IP 노출 (우선순위 4)
> **목표:** 동적 IP (ISP 변경) 대응 — 공인 IP를 자동 감지해서 musu.pro에 등록

**문제:** 현재 registry.py가 보내는 `public_url`은 Tailscale IP나 로컬 IP일 수 있음
**목표:** 실제 공인 IP (NAT 외부 IP) 감지 → 포트포워딩과 함께 musu.pro에 등록

**변경 파일:**
- `musu-bridge/registry.py` — STUN/공인 IP 감지 추가
- `scripts/setup-firewall.sh` (신규) — 포트 8070/4433 자동 개방

**수락 기준:**
- ISP가 IP를 바꿔도 노트북이 5분 이내에 최신 IP로 연결
- musu.pro nodes 목록에 올바른 공인 IP 표시

**세부 플랜 파일:** `docs/plans/YYYY-MM-DD-phase4-public-ip.md`

---

### Phase 5: Wake-on-LAN (미래)
> **목표:** 노트북에서 원격 데스크탑 깨우기

**구현 아이디어:**
- musu.pro에 `{mac_address, broadcast_ip}` 저장
- 노드 요청 시 musu.pro가 Magic Packet 발송 중계
- 또는: 항상 켜있는 노드(예: 서버)가 Magic Packet 대신 발송

**메모:** 이 phase는 구현 우선순위 낮음. 두 데스크탑 항상 켜두는 걸 권장.

---

## 환경 변수 설계 (전체)

```bash
# 현재 작동
MUSU_TOKEN=<bearer>              # musu.pro 인증
MUSU_NODE_NAME=hugh-main-1       # 이 노드의 이름
MUSU_BRIDGE_URL=http://0.0.0.0:8070  # 브리지 바인딩

# Phase 1에서 추가
MUSU_PEER_CACHE=/home/user/.musu/peers.json  # 기본값
MUSU_PEER_REFRESH_INTERVAL=300   # musu.pro에서 peers 재조회 주기 (초)

# Phase 2에서 추가
MUSU_CONNECTS_PORT=4433          # QUIC 포트
MUSU_CONNECTS_HOST=0.0.0.0       # QUIC 바인딩

# Phase 4에서 추가
MUSU_PUBLIC_URL=http://auto      # "auto"면 STUN으로 감지
```

---

## 파일 구조 (최종 상태)

```
musu-bridge/
├── server.py              # FastAPI + lifespan (수정)
├── registry.py            # musu.pro 하트비트 (수정: GET peers 추가)
├── discovery.py           # mDNS (수정: callback 추가)
├── mesh_router.py         # HTTP/QUIC 라우팅 (수정: peers 자동 로드)
├── sync_engine.py         # 데이터 동기화 (변경 없음)
├── peer_cache.py          # peers.json CRUD (신규 — Phase 1)
└── quic_client.py         # QUIC 연결 관리 (신규 — Phase 2)

musu-connects/
└── apps/musu-connectsd/
    └── src/
        └── main.rs        # bridge-mode 추가 (Phase 2)

docs/plans/
├── 2026-04-16-phase1-cloud-discovery.md   (Phase 1 시작 시)
├── 2026-04-16-phase2-quic-transport.md    (Phase 2 시작 시)
└── ...
```

---

## 검증 방법 (Phase 1 기준)

```bash
# 1. main-pc: bridge 실행
MUSU_TOKEN=<token> MUSU_NODE_NAME=hugh-main-1 python musu-bridge/server.py

# 2. musu.pro에 등록 확인
curl -H "Authorization: Bearer <token>" https://musu.pro/api/v1/nodes

# 3. second-pc: bridge 실행 (nodes.toml 없이)
MUSU_TOKEN=<token> MUSU_NODE_NAME=second-pc python musu-bridge/server.py

# 4. second-pc bridge 로그에서 peer 자동 발견 확인
# 기대: "Discovered peer: hugh-main-1 @ http://1.2.3.4:8070"

# 5. peers.json 생성 확인
cat ~/.musu/peers.json

# 6. MCP를 통해 delegate_task가 remote node로 라우팅되는지 확인
# mcp__musu-control__delegate_task channel=engineer instruction='hello from second-pc'
```

---

## 진행 순서

```
[완료] Phase 0 — 기반 구성요소
[완료] Phase 1 — Cloud Peer Discovery (peers.json + musu.pro 자동 조회)
  ↓
[다음] Phase 2 — QUIC Transport (musu-connectsd bridge-proxy)
  ↓
[나중] Phase 3 — LAN Fast Path
  ↓
[나중] Phase 4 — 공인 IP 자동 감지
  ↓
[미래] Phase 5 — Wake-on-LAN
```

---

*업데이트: Phase 완료 시 해당 Phase 상태를 ✅로 변경*
