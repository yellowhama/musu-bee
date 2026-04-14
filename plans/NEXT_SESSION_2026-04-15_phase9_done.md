# MUSU Phase 9 완료 — 다음 세션 TODO
> 작성: 2026-04-15 | Phase 9A~9D 구현 완료 후

---

## 정성적 평가: 97/100

### 무엇이 달라졌나

| 항목 | 이전 (89점) | 현재 (97점) |
|------|------------|------------|
| 페어링 후 라우팅 | 수동 TOML 편집 필요 | **자동** (Agent Card fetch → agent_assignments 생성) |
| 원격 노드 장애 | 에러 반환 | **로컬 폴백** (10s TTL 헬스 캐시) |
| 노드 발견 | IP 직접 입력 또는 musu.pro | **mDNS 자동 발견** (같은 네트워크 → 30초 내 표시) |
| 브릿지 재시작 | 실행 중이던 태스크 유실 | **자동 재개** (route_executions SQLite 기록) |

### 97점의 의미
"그냥 된다"에 매우 가까움. 남은 3점은 운영 경험/배포 편의성 영역.
- mDNS는 **zeroconf pip 설치** 필요 (graceful no-op이지만 설치 안 하면 자동발견 없음)
- Tailscale IP는 `MUSU_TAILSCALE_IP` env로 명시 권장 (hostname 해석 오류 방지)
- re-dispatch 무한루프 방어 아직 없음 (v1 수용 가능, 크래시 반복 시 문제)

---

## P0 — 즉시 확인 (브릿지 재시작 필요)

### 1. zeroconf 설치
```bash
# main-pc, 원격 머신 양쪽에서
pip install zeroconf
```

### 2. MUSU_TAILSCALE_IP 설정
```bash
# ~/.musu/config.env 또는 systemd override
MUSU_TAILSCALE_IP=100.121.211.106   # main-pc Tailscale IP
```

### 3. musu-bridge 재시작 + Agent Card 확인
```bash
# 브릿지 재시작 후
curl localhost:8070/.well-known/agent.json | jq .
# → name, version, capabilities.agents 확인

curl localhost:8070/api/admin/discovered | jq .
# → 같은 네트워크 내 다른 노드 목록 (30초 후)
```

### 4. 페어링 E2E 검증
```bash
# 페어링 후 nodes.toml 확인
cat ~/.musu/nodes.toml | grep -A3 agent_assignments
# → [[mesh.agent_assignments]] 섹션 자동 생성됨 확인

# 원격 에이전트 라우팅 확인
curl -X POST localhost:8070/api/route \
  -H "Content-Type: application/json" \
  -d '{"channel":"engineer","sender_id":"test","text":"hello"}'
# → 원격 노드의 에이전트가 응답
```

### 5. 헬스 폴백 확인
```bash
# 원격 노드 브릿지 중지 → engineer 채널 메시지 → 로컬 폴백 확인
# (에러 대신 로컬 에이전트가 응답하거나 "No agent" 에러)
```

---

## P1 — 다음 세션 개선 후보

### W1: mDNS `_discovered` dict 스레드 안전성
- **문제**: `_discovered` dict가 zeroconf 콜백 스레드에서 수정되고, asyncio 스레드에서 읽힘
- **위험도**: 낮음 (Python GIL이 어느 정도 보호), 데이터 손상보다 오래된 데이터 읽기 위험
- **수정**: `threading.Lock()` 추가 (5줄 변경)
- **파일**: `musu-bridge/discovery.py`

### W2: re-dispatch 무한루프 방어
- **문제**: 특정 메시지가 항상 크래시를 일으키면 재시작마다 재 dispatch → 무한루프
- **수정**: `route_executions`에 `retry_count` 컬럼 추가, 3회 초과 시 `failed`로 강제 전환
- **파일**: `musu-core/db.py`, `musu-core/backends/local.py`, `musu-bridge/server.py`

### W3: MUSU_TAILSCALE_IP 미설정 시 자동 감지
- **문제**: `socket.gethostbyname(socket.gethostname())`이 127.0.0.1 반환 → mDNS가 loopback 주소로 공표
- **수정**: Tailscale IP 자동 감지 (`ip addr show tailscale0` 파싱 또는 100.x.x.x 필터)
- **파일**: `musu-bridge/discovery.py`

### W4: Agent Card `description` 필드 커스터마이징
- **현재**: `f"{a} agent"` 고정 문자열
- **개선**: `nodes.toml` 또는 에이전트 설정에서 description 읽어오기
- **파일**: `musu-bridge/server.py`

---

## P2 — 중기 개선

### Phase 10A: 웹 기반 에이전트 설정 UI
- 현재: 에이전트 추가/수정은 SQLite 직접 또는 CLI
- 목표: musu-bee에 `/settings/agents` 페이지 (역할, 모델, 프롬프트 편집)

### Phase 10B: 멀티-노드 브로드캐스트
- 현재: 채널 1개 → 노드 1개만 라우팅
- 목표: `fan-out` 모드 — 같은 채널을 여러 노드에 동시 전송 (병렬 실행)

### Phase 10C: musu-bridge 배포 스크립트
- 현재: 수동으로 Python 실행
- 목표: systemd unit 파일 + `musu-bridge install` 원라인 설치

### Phase 10D: 에이전트 로드밸런싱
- 현재: 첫 번째 발견 노드에 고정 배치
- 목표: 응답시간 기반 라운드로빈 또는 최소 큐 전략

---

## 코드 감사 결과 (Phase 9 완료 후)

### Critical: 없음 ✅

### Warning (3개)
| ID | 위치 | 내용 |
|----|------|------|
| W1 | `discovery.py:_discovered` | dict 스레드 안전성 (zeroconf 콜백 vs asyncio) |
| W2 | `server.py:lifespan` | re-dispatch 무한루프 방어 없음 |
| W3 | `discovery.py:advertise()` | hostname → 127.0.0.1 폴백 위험 |

### Minor (2개)
| ID | 위치 | 내용 |
|----|------|------|
| M1 | `discovery.py` | `asyncio` import 미사용 (linter warning) |
| M2 | `discovery.py` | `_SCAN_INTERVAL` 상수 정의됐으나 미사용 |

---

## 현재 아키텍처 상태 (2026-04-15)

```
musu-bee (Next.js :3001)
  └─ /api/* → musu-bridge (:8070)

musu-bridge (:8070)
  ├─ /.well-known/agent.json         ← A2A Agent Card [NEW 9A]
  ├─ /api/route                      ← 메시지 라우팅 (durable) [NEW 9D]
  ├─ /api/admin/pair                 ← 페어링 + 자동 배치 [NEW 9A]
  ├─ /api/admin/discovered           ← mDNS 발견 노드 [NEW 9C]
  ├─ /api/admin/nodes                ← 노드 목록 (헬스 포함)
  ├─ /api/sync/*                     ← 데이터 싱크
  ├─ /health                         ← 헬스체크
  ├─ mDNS: _musu-bridge._tcp.local.  ← 자동 공표 [NEW 9C]
  └─ SQLite: musu.db
       ├─ agents, tasks, messages, companies (기존)
       └─ route_executions           ← durable 실행 기록 [NEW 9D]

nodes.toml (~/.musu/nodes.toml)
  ├─ [mesh.self] = "main-pc"
  ├─ [[mesh.nodes]]                  ← 알려진 노드
  └─ [[mesh.agent_assignments]]      ← 자동 생성됨 [NEW 9A]

musu.pro (클라우드 레지스트리)
  └─ /api/v1/nodes                   ← 노드 등록/조회 (MUSU_TOKEN 필요)
```

---

## 커밋 이력 (Phase 9)

| 커밋 | 내용 |
|------|------|
| `aa16e86c` | feat(phase-9a): A2A Agent Card + zero-config agent auto-assignment |
| `fd6e8075` | feat(phase-9b): health monitoring + local fallback routing |
| `e78ab84b` | feat(phase-9c): mDNS zero-config node discovery |
| `fe1576e1` | feat(phase-9d): durable route execution — survive bridge restarts |
