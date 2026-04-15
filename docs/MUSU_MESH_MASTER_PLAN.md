# MUSU Mesh — Master Plan
> 작성: 2026-04-16 | 업데이트: 2026-04-17 | 상태: Phase 5 완료

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

---

## Phase 진행 현황

```
✅ Phase 0 — 기반 구성요소
✅ Phase 1 — Cloud Peer Discovery
✅ Phase 2 — QUIC Transport
✅ Phase 3 — QUIC Hardening (cert pinning + connection pool)
✅ Phase 4 — Security Hardening (FingerprintVerifier + SSRF 방어)
✅ Phase 5 — LAN Fast Path (mDNS → mesh_router 자동 등록 + fingerprint E2E)
✅ Phase 6 — 공인 IP 자동 감지 (ipify fallback)
📋 Phase 7 — Wake-on-LAN
```

---

## ✅ Phase 0 — 기반 구성요소 (완료)

| 컴포넌트 | 상태 | 위치 |
|---------|------|------|
| `registry.py` — musu.pro 하트비트 | ✅ | `musu-bridge/registry.py` |
| `discovery.py` — mDNS LAN 탐색 | ✅ | `musu-bridge/discovery.py` |
| `mesh_router.py` — nodes.toml 기반 HTTP 라우팅 | ✅ | `musu-bridge/mesh_router.py` |
| `sync_engine.py` — 30초 pull 기반 동기화 | ✅ | `musu-bridge/sync_engine.py` |
| musu.pro nodes API — 노드 등록/조회 | ✅ | `vibecode-town/src/app/api/v1/nodes/` |

---

## ✅ Phase 1 — Cloud Peer Discovery (완료)

> **목표:** nodes.toml 수동 설정 없이 musu.pro에서 자동으로 peers를 발견하고 peers.json에 캐시

- `peer_cache.py` 신규 — peers.json 읽기/쓰기
- `registry.py` — GET /api/v1/nodes 조회 + peers.json 갱신
- `mesh_router.py` — peer_cache에서 노드 자동 로드

---

## ✅ Phase 2 — QUIC Transport (완료)

> **목표:** HTTP mesh routing을 QUIC으로 교체

**흐름:**
```
Python mesh_router.forward()
  → POST http://127.0.0.1:9443/forward (QUIC sidecar)
  → QUIC UDP 4433 → remote musu-connectsd
  → POST http://127.0.0.1:8070/api/route (remote bridge)
```

- `musu-connectsd bridge-proxy` 명령어 구현 (Rust, Quinn 0.11)
- `mesh_router.py` — QUIC 우선 + HTTP fallback
- `scripts/start-bridge.sh` — 통합 시작 스크립트

---

## ✅ Phase 3 — QUIC Hardening (완료, 2026-04-16)

> **목표:** TLS cert 영구 저장 + fingerprint 추출 + connection pool

- `load_or_gen_cert()` — `~/.musu/quic_cert.der` 영구 저장, 재시작 후 동일 fingerprint
- `cert_fingerprint()` — SHA-256 (ring::digest) fingerprint 계산
- `MUSU_QUIC_FINGERPRINT` env — heartbeat에 fingerprint 포함
- `ConnPool` (DashMap) — 60s idle TTL, 재사용 연결 풀
- `registry.py` heartbeat — `cert_fingerprint` 필드 포함

---

## ✅ Phase 4 — Security Hardening (완료, 2026-04-17)

> **목표:** MITM 방어 (FingerprintVerifier) + SSRF 방어 + pool 안정성

### 4A — vibecode-town cert_fingerprint
- `docs/migrations/009_add_cert_fingerprint.sql` — `ALTER TABLE nodes ADD COLUMN IF NOT EXISTS cert_fingerprint TEXT`
- `src/lib/types/node.ts` — `RegistryNode.cert_fingerprint` 필드
- `src/lib/db/repositories/nodes.repo.ts` — upsert/select 포함
- `src/lib/services/nodes.service.ts` + `register/route.ts` — optional param

> ⚠️ **Supabase migration 수동 실행 필요** (SQL Editor에서 009 SQL 실행)

### 4B — FingerprintVerifier (bridge_proxy.rs)
- `FingerprintVerifier { expected }` — TLS 핸드셰이크 시 SHA-256 비교
- `FingerprintCache` (DashMap) — IP → fingerprint 캐시
- `fetch_fingerprint()` — musu.pro /api/v1/nodes에서 조회
- `resolve_peer_config()` — cache → musu.pro → NoVerifier fallback
- `MUSU_TOKEN` + `MUSU_NODES_URL` env 설정 시 활성화

### 4C — SSRF 방어 (sync_engine.py)
- `_is_safe_peer_url()` — RFC 1918 + link-local IP literal 차단
- `_PRIVATE_NETWORKS` 목록 (10/8, 172.16/12, 192.168/16, 127/8, 169.254/16, ::1, fc00/7)
- 호스트명은 신뢰 (nodes.toml / musu.pro에서 온 것)

### 4D — Pool 안정성 (bridge_proxy.rs)
- `DashMap.alter()` 원자 타임스탬프 갱신 (TOCTOU 제거)
- conn.clone() 후 entry drop — DashMap lock을 .await 넘어서 보유하지 않음
- `cleanup_pool_loop()` — 30s tokio interval, 유휴/닫힌 연결 prune
- `OnceLock<reqwest::Client>` — static shared HTTP client

### 4E — system stats API
- `musu-bridge/system_stats.py` — psutil + nvidia-smi (2s cache)
- `GET /api/system/stats` — auth 없음 (Tailscale 내부망 전용)
- 응답: `{cpu, ram, disk, gpus, timestamp}`

---

## ✅ Phase 5 — LAN Fast Path + Fingerprint E2E (완료, 2026-04-17)

> **목표:** mDNS peer → mesh_router 자동 등록 + QUIC fingerprint E2E 검증

### 5A — fingerprint export (`scripts/start-bridge.sh`)
- Python 시작 전 `~/.musu/quic_cert.der`에서 openssl SHA-256 계산
- `MUSU_QUIC_FINGERPRINT` export → Python heartbeat에서 읽힘

### 5B — smoke test (`scripts/verify-fingerprint.sh`)
- 4단계: token 확인 → 로컬 fingerprint → musu.pro 조회 → local==remote 비교

### 5C — mDNS LAN Fast Path (`server.py`)
- `_mdns_register_loop()` — 15s 주기로 `discovery.get_discovered()` → `router.add_node()`
- `AsyncZeroconf.async_register_service()` — uvicorn 이벤트 루프 블록 방지

---

## ✅ Phase 6 — 공인 IP 자동 감지 (완료, 2026-04-17)

> **목표:** Tailscale 없는 환경에서 공인 IP를 자동 감지해서 musu.pro에 등록

- `discovery.py` — `detect_public_ip()`: ipify/checkip API, RFC1918+CGNAT 거부, 프로세스 캐시
- `server.py` — `public_url` 계산: `cfg.public_url` → Tailscale IP → ipify → hostname fallback

---

## 📋 Phase 7 — Wake-on-LAN

> **목표:** 노트북에서 원격 데스크탑 깨우기

- musu.pro에 `{mac_address, broadcast_ip}` 저장
- 항상 켜있는 노드가 Magic Packet 대신 발송

---

## 환경 변수

```bash
# 현재 사용 중
MUSU_BRIDGE_TOKEN=<token>        # 브릿지 인증
MUSU_TOKEN=<token>               # musu.pro API 인증 (peer discovery + fingerprint)
MUSU_NODE_NAME=hugh-main-1       # 이 노드의 이름
MUSU_BRIDGE_URL=http://0.0.0.0:8070

# Phase 3+에서 추가됨
MUSU_QUIC_PORT=4433
MUSU_HTTP_PROXY_PORT=9443
MUSU_QUIC_FINGERPRINT=<sha256>   # 자동 설정 (bridge_proxy.rs)
MUSU_NODES_URL=https://musu.pro/api/v1/nodes  # fingerprint 조회
```

---

*업데이트: Phase 완료 시 해당 Phase 상태를 ✅로 변경*
